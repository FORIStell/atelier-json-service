"""Turn a finetune_mfr.py checkpoint into a HF model dir: python ckpt_to_hf.py <base_hf_dir> <ckpt.pt> <out_dir>"""
import shutil, sys, torch
from transformers import VisionEncoderDecoderModel
base, ck, out = sys.argv[1:4]
m = VisionEncoderDecoderModel.from_pretrained(base)
m.load_state_dict(torch.load(ck, weights_only=False)['model'])
m.save_pretrained(out)
for f in ['tokenizer.json', 'tokenizer_config.json', 'special_tokens_map.json', 'generation_config.json', 'preprocessor_config.json']:
    shutil.copy(f'{base}/{f}', f'{out}/{f}')
