# MathBot 🤖

A math robot in your browser. **Snap a photo**, **write with your finger**, or **type** a problem, and MathBot shows **every step** to the answer.

Works on **iPhone, Android and PC**, installs like an app, and works **offline**. Everything runs on your device: no server, no account.

## What it can solve

| Topic | Examples |
|---|---|
| Arithmetic (order of operations, fractions, decimals, %, roots, factorials) | `2+3*4^2`, `2/3 ÷ 4/5`, `15% of 80`, `sqrt(144)+5!` |
| Linear equations | `3(x+2) - 4 = 2x + 7`, `x/2 + 1/3 = 5` |
| Quadratic and polynomial equations | `x^2 - 5x + 6 = 0`, `2x^2+3x-4=0`, `x^3-6x^2+11x-6=0` |
| Rational, radical, absolute-value equations | `1/x + 1/(x+1) = 1/2`, `sqrt(x+3) = x-3`, `\|2x-1\| = 5` |
| Exponential, log and trig equations | `2^(x+1) = 16`, `log(x)+log(x-3) = 1`, `2sin(x) - 1 = 0` |
| Inequalities | `2x+3 > 7`, `x^2-4 > 0`, `\|x-3\| < 5`, `1 < 2x+3 < 9` |
| Systems of equations | `3x+2y=12, x-y=-1`, `x+y+z=6, 2x-y+z=3, x+2y-z=2`, `y=x^2, y=x+2` |
| Factor / expand / simplify | `factor 6x^2+11x-10`, `expand (x+2)^3`, `simplify (x^2-9)/(x+3)` |
| Functions | `y = 2x+3` (slope, intercepts), `y = x^2-4x+3` (vertex, roots) |
| Derivatives | `d/dx x^3 sin(x)`, `second derivative of x^4` |
| Integrals | `∫ x e^x dx`, `integrate from 0 to 1 of x^2` |
| Limits | `lim x->2 (x^2-4)/(x-2)`, `lim x->oo (3x^2+1)/(x^2-5)` |
| Sums and series | `Σ` template: Σ n² for n=1..10, Σ k for k=1..n (formula), geometric series to ∞ |
| Combinatorics, complex numbers | `nCr(10,3)`, `nPr(5,2)`, `(3+4i)/(1+2i)`, `e^(iπ)` |
| Exact roots and logs | `⁶√(2∛4)` → ¹⁸√32, `2/(1+√2)` → 2√2−2, `√(2+√3)` → (√2+√6)/2, `log 5 + log 2` → 1 |
| Function analysis (11th–12th grade) | `derivative of x^3 at x=2`, `tangent line to x^2 at x=3`, `extrema of x^3-3x`, `asymptotes of (x^2+1)/(x-1)`, `domain of ln(x+3)/(x-1)`, `inverse of f(x)=(2x+1)/(x-3)` |
| Sequences and series | `3, 7, 11, ...`, `geometric series 2+4+8+...+256`, `0.5 + 0.25 + ...`, `sum k=1 to n of k^2` |
| University | `partial fractions (3x+5)/(x^2+x-2)`, `eigenvalues [[2,1],[1,2]]`, `y' = x y`, `y' = y + x`, `∫ e^x sin(x) dx`, complex roots, `|3+4i|` |
| Statistics, number theory | `mean of 2,4,4,5`, `std of ...`, `gcd(12,18)`, `prime factorization of 360` |

### The app

* **Camera home screen** – point at a problem, drag the frame corners around it, tap the red button. Or pick a photo from the gallery. Flash button appears on phones that support it.
* **Calculator** – a math keyboard with templates (□ boxes) for fractions, powers, any root, absolute value, logs, trig, limits, derivatives, integrals, sums, products, nCr and matrices. Hold a key with a red dot for more options (e.g. hold `>` for `< ≥ ≤ ≠`). ← → move the cursor, ⏎ solves, hold ⌫ to clear.
* **Write** – write a problem with your finger.
* **Menu** – history, degrees/radians, tips.

Each answer comes with explanations of the rule used at every step (e.g. "Subtract 2x from both sides", "Quadratic formula", "Chain rule"), a check of the answer, and a graph when it helps.

## Use it

* **Online:** after this is merged, the GitHub Action publishes the `web/` folder to GitHub Pages.
  Turn it on once in **Settings → Pages → Source: GitHub Actions**. The app will be at `https://<user>.github.io/<repo>/`.
* **Install on iPhone:** open the link in Safari → Share → **Add to Home Screen**.
* **Install on PC:** open the link in Chrome/Edge → install icon in the address bar.
* **Run on your PC:** install [Python 3](https://www.python.org/downloads/), then in the project folder run `python run.py` (or double-click `run.py`). It opens http://localhost:8000. Don't double-click `web/index.html`: browsers block the app on file:// pages, so the buttons won't respond.
* **Host it on your Wi-Fi:** run `python host_wifi.py` and open the address it prints on any phone/computer on the same Wi-Fi. It uses https so the phone camera works (the phone shows a one-time "not private" warning because the certificate is made by your own computer; tap through it). Needs `pip install cryptography` or the `openssl` command; otherwise it falls back to http, where everything except the live camera works. Allow Python through the firewall if asked.

## How it works

```
web/
  index.html, app.js, style.css   the app (camera home, calculator, write, solution, history)
  src/engine/                     the math engine (pure JavaScript)
    parser.js     text -> expression tree (implicit multiplication, unicode, LaTeX bits)
    rational.js   exact fractions with BigInt
    cas.js        simplifier, expansion, polynomials
    arith.js      step-by-step arithmetic (PEMDAS)
    factor.js     factoring (GCF, trinomials, AC method, grouping, special products, rational roots)
    solve.js      equations, inequalities, systems
    calculus.js   derivatives, integrals, limits
    index.js      decides what kind of problem it is
    latex.js      converts the calculator keyboard's LaTeX into engine input
  src/ocr/                        reading photos and handwriting
    preprocess.js adaptive thresholding, connected components, 32x32 symbol images
    model.js      tiny CNN (408k parameters, 0.8 MB) running in plain JavaScript
    recognize.js  merges =, ÷, i, ≤; finds fractions, square roots and exponents
  model/          trained weights (symbols.json + symbols.bin)
training/         Python scripts that build the dataset and train the model
tests/            engine tests (npm test)
```

### Reading handwriting and photos

Two readers work together:

1. **Fast reader** (always available, 1.4 MB): our own tiny CNN symbol classifier (691k parameters, 94% per-symbol accuracy, plain JavaScript) plus layout rules for fractions, roots and exponents. It knows 56 symbols and was trained on ~190k images (MNIST, EMNIST, HASYv2, symbols cut out of CROHME, printed fonts).
2. **Accurate reader** (optional one-time ~43 MB download, then offline): [Pix2Text-MFR 1.5](https://huggingface.co/breezedeus/pix2text-mfr-1.5) (MIT), **fine-tuned by us on ~14k real handwritten formulas** (made to look like phone photos: paper colour, ruled lines, shadows, blur, pencil), shrunk to 8-bit, run with onnxruntime-web. It searches several readings limited to school-math symbols (rare symbols like π, α, cos get a small penalty), also scores the fast reader's reading, and keeps the best one our math engine can understand.

Measured on real handwritten school-level problems that were never used for training ("exactly right" = the whole problem read correctly):

| Test set | Fast reader | Before fine-tuning | **Now** | Right answer in the top 3 ("Did you mean…?") |
|---|---|---|---|---|
| CROHME 2019, 200 problems (handwriting drawn on tablets) | 42% | 70% | **95.5%** | 99.5% |
| CROHME 2023, 196 problems (handwriting scanned on lined paper, rows never trained on) | 25% | 57% | **80%** | 90% |
| CROHME 2019, 200 university-level formulas (∫, Σ, lim, trig, logs, Greek letters) | 18% | – | **73%** | 85% |
| Printed problems (synthetic photos) | 100% | – | – | – |

Some test formulas also appear in the training data (written by other people). On only the formulas it never saw, the reader gets 94% (tablet) and 69% (paper), up from 76% and 49%.

When the first reading is wrong, the solution page shows **Did you mean…?** with the next best readings; one tap solves that one instead.

Messy or unusual handwriting is still hard; always check the problem shown on the solution page and tap **Edit** to fix it.

To retrain:

```bash
pip install torch numpy pillow scipy pandas pyarrow
cd training
python extract_crohme.py $MATH_DATA/crohme_sym.npz $MATH_DATA/crohme/*.parquet
python build_dataset.py
WIDE=1 DATASET=symbols.npz python train.py 18   # writes web/model/symbols.{json,bin}
python make_eval.py $MATH_DATA/eval && node eval_ocr.mjs $MATH_DATA/eval
# combined reader evaluation (needs onnxruntime, tokenizers and the Pix2Text-MFR files in $MFR)
python make_school_eval23.py $MATH_DATA/paper 200 3000 && node dump_tiny.mjs $MATH_DATA/paper $MATH_DATA/paper/tiny.json
python hybrid_eval.py $MATH_DATA/paper $MFR $MATH_DATA/paper/tiny.json cands.json --pen=2 --bonus=0.3 --aspect=4
node pick_valid.mjs cands.json best.json && node eval_compare.mjs $MATH_DATA/paper best.json
# fine-tune the accurate reader (CPU, ~3 h): rebuild PyTorch weights, precompute augmented features, train, export
python onnx_to_hf.py $MFR $MATH_DATA/mfr_pt
python finetune_data.py $MATH_DATA/mfr_pt $MATH_DATA/ft 2 8
python finetune_mfr.py $MATH_DATA/mfr_pt $MATH_DATA/ft $MATH_DATA/ft_run 3 8
python export_mfr.py $MATH_DATA/ft_run/final web/model/mfr
```

## Limits

* Photos work best with one problem per line, dark ink, and the problem filling the frame. You can always fix the recognized text before solving.
* Very messy handwriting, matrices, and multi-line work (e.g. long division layouts) are not recognized from photos; type them instead.
* Some integrals and equations have no step-by-step method here; MathBot then says so or gives a numeric answer.

Third-party (MIT licensed, bundled so the app works offline): [KaTeX](https://katex.org) in `web/vendor/katex` for showing math, [MathLive](https://mathlive.io) in `web/vendor/mathlive` for the editable math input box, [onnxruntime-web](https://github.com/microsoft/onnxruntime) in `web/vendor/ort` and [Pix2Text-MFR](https://huggingface.co/breezedeus/pix2text-mfr-1.5) in `web/model/mfr` for the accurate reader.
