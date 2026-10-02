# Accurate formula reader

`encoder_model.onnx`, `decoder_model.onnx`, `tokenizer.json`: based on **Pix2Text-MFR 1.5** by breezedeus
(https://huggingface.co/breezedeus/pix2text-mfr-1.5), MIT license.

We fine-tuned it on real handwriting (CROHME train + 2014 + 2016 tablet writing and CROHME 2023 paper scans,
rows < 2900), with photo-style augmentation, in two rounds: first the last 4 encoder layers and the decoder,
then the last 8 encoder layers and the decoder on new augmentations
(`training/finetune_data.py`, `training/finetune_mfr.py`). The weights were then dynamically quantized to
8-bit (`onnxruntime.quantization.quantize_dynamic`, QUInt8) to shrink them from 120 MB to 32 MB
(`training/export_mfr.py`).

It is downloaded only if the user agrees (or turns on "Accurate reader" in the menu), then cached
for offline use. See `web/src/ocr/mfr.js` for how it is combined with the tiny symbol model.
