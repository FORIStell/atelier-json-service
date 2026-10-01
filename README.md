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
| Statistics, number theory | `mean of 2,4,4,5`, `std of ...`, `gcd(12,18)`, `prime factorization of 360` |

Each answer comes with explanations of the rule used at every step (e.g. "Subtract 2x from both sides", "Quadratic formula", "Chain rule"), a check of the answer, and a graph when it helps.

## Use it

* **Online:** after this is merged, the GitHub Action publishes the `web/` folder to GitHub Pages.
  Turn it on once in **Settings → Pages → Source: GitHub Actions**. The app will be at `https://<user>.github.io/<repo>/`.
* **Install on iPhone:** open the link in Safari → Share → **Add to Home Screen**.
* **Install on PC:** open the link in Chrome/Edge → install icon in the address bar.
* **Run locally:** `npm start`, then open http://localhost:8000.

## How it works

```
web/
  index.html, app.js, style.css   the app (tabs: Scan, Write, Calculator, History)
  src/engine/                     the math engine (pure JavaScript)
    parser.js     text -> expression tree (implicit multiplication, unicode, LaTeX bits)
    rational.js   exact fractions with BigInt
    cas.js        simplifier, expansion, polynomials
    arith.js      step-by-step arithmetic (PEMDAS)
    factor.js     factoring (GCF, trinomials, AC method, grouping, special products, rational roots)
    solve.js      equations, inequalities, systems
    calculus.js   derivatives, integrals, limits
    index.js      decides what kind of problem it is
  src/ocr/                        reading photos and handwriting
    preprocess.js adaptive thresholding, connected components, 32x32 symbol images
    model.js      tiny CNN (408k parameters, 0.8 MB) running in plain JavaScript
    recognize.js  merges =, ÷, i, ≤; finds fractions, square roots and exponents
  model/          trained weights (symbols.json + symbols.bin)
training/         Python scripts that build the dataset and train the model
tests/            engine tests (npm test)
```

### The handwriting model

The symbol classifier knows 56 symbols: digits, `+ − × ÷ = ( ) [ ] / < > ≤ ≥ ! % | √ ∫ π θ ∞` and lowercase letters.
It was trained on ~190k images from several sources so it understands many handwriting styles and printed text:

* [MNIST](https://huggingface.co/datasets/ylecun/mnist) and [EMNIST](https://huggingface.co/datasets/Royc30ne/emnist-byclass) handwritten digits and letters
* [HASYv2](https://zenodo.org/records/259444) handwritten math symbols
* symbols cut out of the [CROHME](https://huggingface.co/datasets/Neeze/CROHME-full) handwritten math expressions
* printed symbols rendered from ~40 fonts

To retrain:

```bash
pip install torch numpy pillow scipy pandas pyarrow
cd training
python extract_crohme.py $MATH_DATA/crohme_sym.npz $MATH_DATA/crohme/*.parquet
python build_dataset.py
python train.py 14          # writes web/model/symbols.{json,bin}
python make_eval.py $MATH_DATA/eval && node eval_ocr.mjs $MATH_DATA/eval
```

## Limits

* Photos work best with one problem per line, dark ink, and the problem filling the frame. You can always fix the recognized text before solving.
* Very messy handwriting, matrices, and multi-line work (e.g. long division layouts) are not recognized from photos; type them instead.
* Some integrals and equations have no step-by-step method here; MathBot then says so or gives a numeric answer.

Third-party: [KaTeX](https://katex.org) (MIT) is bundled in `web/vendor/katex` for math rendering.
