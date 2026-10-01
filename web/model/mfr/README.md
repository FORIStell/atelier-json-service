# Accurate formula reader

`encoder_model.onnx`, `decoder_model.onnx`, `tokenizer.json`: **Pix2Text-MFR 1.5** by breezedeus
(https://huggingface.co/breezedeus/pix2text-mfr-1.5), MIT license. The ONNX weights were
dynamically quantized to 8-bit (`onnxruntime.quantization.quantize_dynamic`, QUInt8) to shrink
them from 120 MB to 32 MB; accuracy on our tests stayed within 1 point.

It is downloaded only if the user agrees (or turns on "Accurate reader" in the menu), then cached
for offline use. See `web/src/ocr/mfr.js` for how it is combined with the tiny symbol model.
