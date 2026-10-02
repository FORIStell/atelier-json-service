#!/bin/bash
# round 2: more augmentations, 8 encoder layers trainable, start from the round-1 model. Safe to re-run after a restart.
cd /home/user/atelier-json-service/training
D=/home/user/data
[ "$(cat $D/ft2/done.txt 2>/dev/null)" = "27730" ] || SEED=1000003 python3 finetune_data.py $D/mfr_pt $D/ft2 2 4 >> $D/ft2_data.log 2>&1
[ -f $D/ft_run2/final/model.safetensors ] || LR_DEC=3e-5 LR_ENC=2e-5 python3 finetune_mfr.py $D/ft_run/final $D/ft2 $D/ft_run2 2 4 >> $D/ft_run2.log 2>&1
[ -f $D/ft_q2/encoder_model.onnx ] || python3 export_mfr.py $D/ft_run2/final $D/ft_q2 >> $D/ft_run2.log 2>&1
for s in school paper2; do
  T=$D/$s/tiny.json; [ -f $T ] || T=$D/$s/tiny_tex.json
  [ -f $D/$s/cands_ft2.json ] || python3 hybrid_eval.py $D/$s $D/ft_q2 $T $D/$s/cands_ft2.json --pen=5 --bonus=0.3 --aspect=4 >> $D/ft_run2.log 2>&1
  node pick_valid.mjs $D/$s/cands_ft2.json $D/$s/best_ft2.json >> $D/ft_run2.log 2>&1
done
echo ROUND2_DONE >> $D/ft_run2.log
