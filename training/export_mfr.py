"""Export a fine-tuned Pix2Text-MFR (HF format) to the two ONNX files the app uses, then quantize to 8 bit.
python export_mfr.py <hf_model_dir> <out_dir>
Writes <out_dir>/encoder_model.onnx and decoder_model.onnx (QUInt8, same inputs/outputs as the originals)
plus the tokenizer files copied from the hf dir."""
import os, shutil, sys, tempfile
import torch
from onnxruntime.quantization import QuantType, quantize_dynamic
from transformers import VisionEncoderDecoderModel

src, out = sys.argv[1], sys.argv[2]
os.makedirs(out, exist_ok=True)
m = VisionEncoderDecoderModel.from_pretrained(src).eval()


class Enc(torch.nn.Module):
    def __init__(s): super().__init__(); s.e = m.encoder
    def forward(s, pixel_values): return s.e(pixel_values=pixel_values).last_hidden_state


class Dec(torch.nn.Module):
    def __init__(s): super().__init__(); s.d = m.decoder
    def forward(s, input_ids, encoder_hidden_states): return s.d(input_ids=input_ids, encoder_hidden_states=encoder_hidden_states).logits


tmp = tempfile.mkdtemp()
with torch.no_grad():
    torch.onnx.export(Enc(), (torch.zeros(1, 3, 384, 384),), f'{tmp}/enc.onnx', input_names=['pixel_values'], output_names=['last_hidden_state'],
                      dynamic_axes={'pixel_values': {0: 'batch'}, 'last_hidden_state': {0: 'batch'}}, opset_version=14, dynamo=False)
    torch.onnx.export(Dec(), (torch.ones(1, 3, dtype=torch.long), torch.zeros(1, 578, 384)), f'{tmp}/dec.onnx',
                      input_names=['input_ids', 'encoder_hidden_states'], output_names=['logits'],
                      dynamic_axes={'input_ids': {0: 'batch', 1: 'seq'}, 'encoder_hidden_states': {0: 'batch'}, 'logits': {0: 'batch', 1: 'seq'}},
                      opset_version=14, dynamo=False)
for a, b in [('enc', 'encoder_model'), ('dec', 'decoder_model')]:
    if '--fp32' in sys.argv: shutil.copy(f'{tmp}/{a}.onnx', f'{out}/{b}.onnx')
    else: quantize_dynamic(f'{tmp}/{a}.onnx', f'{out}/{b}.onnx', weight_type=QuantType.QUInt8)
for f in ['tokenizer.json', 'tokenizer_config.json', 'special_tokens_map.json', 'config.json', 'generation_config.json', 'preprocessor_config.json']:
    if os.path.exists(f'{src}/{f}'): shutil.copy(f'{src}/{f}', f'{out}/{f}')
print('exported to', out, {f: os.path.getsize(f'{out}/{f}') // 1024 for f in os.listdir(out) if f.endswith('.onnx')})
