"""Fine-tune the accurate reader (Pix2Text-MFR) on handwriting, using features from finetune_data.py.

python finetune_mfr.py <hf_model_dir> <data_dir> <out_dir> [epochs=2] [split=8]

Trains encoder layers >= split, the final encoder norm and the whole decoder. Resumable: a checkpoint is
written to <out_dir>/ckpt.pt every 200 steps, and the run continues from it when restarted."""
import json, math, os, random, shutil, sys, time
import numpy as np, torch
from transformers import VisionEncoderDecoderModel

src, data, out = sys.argv[1], sys.argv[2], sys.argv[3]
EPOCHS = float(sys.argv[4]) if len(sys.argv) > 4 else 2
SPLIT = int(sys.argv[5]) if len(sys.argv) > 5 else 8
BATCH, WARM = 16, 200
LR_DEC, LR_ENC = float(os.environ.get('LR_DEC', '5e-5')), float(os.environ.get('LR_ENC', '3e-5'))
torch.set_num_threads(os.cpu_count())
torch.manual_seed(0)
os.makedirs(out, exist_ok=True)

feats = np.load(f'{data}/feats.npy', mmap_mode='r')
labels = json.load(open(f'{data}/labels.json'))
n_items = len(labels) // 2  # copies are stored one after another
val_items = set(random.Random(1).sample(range(n_items), 300))
train_idx = [i for i in range(len(labels)) if i % n_items not in val_items]
val_idx = [i for i in sorted(val_items)]  # the mildly augmented copy

model = VisionEncoderDecoderModel.from_pretrained(src)
enc, dec = model.encoder, model.decoder
for p in model.parameters(): p.requires_grad = False
enc_params = [p for l in enc.encoder.layer[SPLIT:] for p in l.parameters()] + list(enc.layernorm.parameters())
dec_params = list(dec.parameters())
for p in enc_params + dec_params: p.requires_grad = True
opt = torch.optim.AdamW([{'params': enc_params, 'lr': LR_ENC}, {'params': dec_params, 'lr': LR_DEC}], weight_decay=0.01)
steps_per_epoch = len(train_idx) // BATCH
TOTAL = int(EPOCHS * steps_per_epoch)
sched = torch.optim.lr_scheduler.LambdaLR(opt, lambda s: min(1, (s + 1) / WARM) * max(0.05, 0.5 * (1 + math.cos(math.pi * min(1, s / TOTAL)))))


def forward(idx, train):
    x = torch.from_numpy(np.stack([feats[i] for i in idx]).astype(np.float32))
    seqs = [labels[i] for i in idx]
    L = max(len(s) for s in seqs) - 1
    inp = torch.zeros(len(seqs), L, dtype=torch.long)
    tgt = torch.full((len(seqs), L), -100, dtype=torch.long)
    for k, s in enumerate(seqs):
        inp[k, :len(s) - 1] = torch.tensor(s[:-1]); tgt[k, :len(s) - 1] = torch.tensor(s[1:])
    h = x
    for layer in enc.encoder.layer[SPLIT:]:
        h = layer(h); h = h[0] if isinstance(h, tuple) else h
    h = enc.layernorm(h)
    logits = dec(input_ids=inp, encoder_hidden_states=h).logits
    loss = torch.nn.functional.cross_entropy(logits.reshape(-1, logits.shape[-1]), tgt.reshape(-1), ignore_index=-100, label_smoothing=0.05 if train else 0)
    with torch.no_grad():
        ok = ((logits.argmax(-1) == tgt) | (tgt == -100)).all(1).float().mean().item()
    return loss, ok


def validate():
    model.eval(); tot, acc, n = 0, 0, 0
    with torch.no_grad():
        for s in range(0, len(val_idx), 32):
            b = val_idx[s:s + 32]; l, a = forward(b, False); tot += l.item() * len(b); acc += a * len(b); n += len(b)
    model.train(); return tot / n, acc / n


step, order = 0, []
ck = f'{out}/ckpt.pt'
if os.path.exists(ck):
    st = torch.load(ck, weights_only=False)
    model.load_state_dict(st['model']); opt.load_state_dict(st['opt']); sched.load_state_dict(st['sched'])
    step, order = st['step'], st['order']
    print('resumed at step', step, flush=True)
else:
    for ep in range(math.ceil(EPOCHS)):
        # shuffled batches of similar label length (less padding)
        e = train_idx[:]; random.Random(ep).shuffle(e)
        chunks = [sorted(e[i:i + BATCH * 50], key=lambda j: len(labels[j])) for i in range(0, len(e), BATCH * 50)]
        bs = [c[i:i + BATCH] for c in chunks for i in range(0, len(c), BATCH)]
        random.Random(ep + 100).shuffle(bs)
        order += [b for b in bs if len(b) == BATCH][:steps_per_epoch]
    print('train', len(train_idx), 'val', len(val_idx), 'steps', TOTAL, flush=True)
    print('before: val loss %.4f  teacher-forced exact %.3f' % validate(), flush=True)
model.train()
t0, run = time.time(), []
while step < TOTAL:
    b = order[step]
    loss, ok = forward(b, True)
    opt.zero_grad(); loss.backward()
    torch.nn.utils.clip_grad_norm_(enc_params + dec_params, 1.0)
    opt.step(); sched.step(); step += 1
    run.append((loss.item(), ok)); run = run[-100:]
    if step % 50 == 0:
        print(f'step {step}/{TOTAL}  loss {np.mean([r[0] for r in run]):.4f}  exact {np.mean([r[1] for r in run]):.3f}  {(time.time() - t0) / 60:.1f} min', flush=True)
    if step % 200 == 0 or step == TOTAL:
        torch.save({'model': model.state_dict(), 'opt': opt.state_dict(), 'sched': sched.state_dict(), 'step': step, 'order': order}, ck + '.tmp')
        os.replace(ck + '.tmp', ck)
    if step % 1000 == 0 or step == TOTAL:
        print('val loss %.4f  teacher-forced exact %.3f' % validate(), flush=True)
model.save_pretrained(f'{out}/final')
for f in ['tokenizer.json', 'tokenizer_config.json', 'special_tokens_map.json', 'generation_config.json', 'preprocessor_config.json']:
    if os.path.exists(f'{src}/{f}'): shutil.copy(f'{src}/{f}', f'{out}/final/{f}')
print('saved', flush=True)
