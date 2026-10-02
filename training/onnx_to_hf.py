"""Rebuild the PyTorch Pix2Text-MFR (VisionEncoderDecoderModel) from its ONNX export so it can be fine-tuned.
python onnx_to_hf.py <mfr_onnx_dir> <out_dir>
Named initializers map directly; anonymous MatMul weights are named after the bias added right after them."""
import sys, numpy as np, onnx, torch
from onnx import numpy_helper
from transformers import VisionEncoderDecoderConfig, VisionEncoderDecoderModel

src, out = sys.argv[1], sys.argv[2]
cfg = VisionEncoderDecoderConfig.from_pretrained(src)
model = VisionEncoderDecoderModel(cfg)
sd = model.state_dict()


def tensors(path, prefix):
    m = onnx.load(path)
    init = {i.name: numpy_helper.to_array(i) for i in m.graph.initializer}
    res = {}
    for k, v in init.items():
        if not k.startswith('onnx::'):
            res[prefix + k] = v
    users = {}
    for n in m.graph.node:
        for i in n.input: users.setdefault(i, []).append(n)
    for n in m.graph.node:
        if n.op_type == 'MatMul' and n.input[1] in init and n.input[1].startswith('onnx::'):
            nxt = [u for u in users.get(n.output[0], []) if u.op_type == 'Add']
            bias = next((i for u in nxt for i in u.input if i.endswith('.bias') and i in init), None)
            if bias is None:
                # matmul without bias (e.g. lm head)
                res.setdefault('__nobias__', []).append(init[n.input[1]])
                continue
            res[prefix + bias[:-5] + '.weight'] = init[n.input[1]].T
    return res


enc = tensors(f'{src}/encoder_model.onnx', 'encoder.')
dec = tensors(f'{src}/decoder_model.onnx', '')
loaded = {}
for k, v in list(enc.items()) + list(dec.items()):
    if k == '__nobias__': continue
    if k in sd and tuple(sd[k].shape) == v.shape: loaded[k] = torch.from_numpy(np.ascontiguousarray(v))
    elif k in sd: print('shape mismatch', k, sd[k].shape, v.shape)
    else: print('unused', k, v.shape)
for v in dec.get('__nobias__', []):
    if 'decoder.output_projection.weight' in sd and v.T.shape == tuple(sd['decoder.output_projection.weight'].shape):
        loaded['decoder.output_projection.weight'] = torch.from_numpy(np.ascontiguousarray(v.T))
missing = [k for k in sd if k not in loaded]
print('loaded', len(loaded), 'of', len(sd), 'missing:', missing)
model.load_state_dict(loaded, strict=False)
model.save_pretrained(out)
