# Three.js Ink Collision Prototype

文字表示なしの Three.js 映像プロトタイプです。広大な平原上で、左右の群れが中央に向かって走り、ライオン、キリン、サイ、ゾウのようなシルエットへ変化しながら、衝突直前に人型へまとまります。中央では黒いインク粒子のように弾け、約 30 秒でループします。

## 構成

- `index.html`: GitHub Pages でそのまま配信できる入口ファイル
- `styles.css`: 全画面キャンバス用の最小スタイル
- `src/main.js`: Three.js シーン、群れ、モーフィング、インク粒子、パッチ管理
- `.nojekyll`: GitHub Pages 用

Three.js は CDN の import map で読み込んでいます。ビルド工程やバックエンドは不要です。

## ローカル確認

ES Modules を使うため、ファイルを直接開くよりローカルサーバー経由で確認してください。任意の静的サーバーで動きます。

```bash
python -m http.server 5173
```

Python がない場合は、たとえば以下でも確認できます。

```bash
npx serve . -l 5173
```

ブラウザで以下を開きます。

```text
http://localhost:5173/
```

マウスまたはタッチ操作で自由に視点移動できます。

特定のループ時点を確認したい場合は、画面には何も表示しないデバッグ用パラメータとして `debugTime` を使えます。

```text
http://localhost:5173/?debugTime=21.3
```

## GitHub Pages で公開する手順

1. このフォルダの内容を GitHub リポジトリに push します。
2. GitHub のリポジトリ画面で `Settings` を開きます。
3. `Pages` を開きます。
4. `Build and deployment` の `Source` を `Deploy from a branch` にします。
5. `Branch` を `main`、フォルダを `/root` にして保存します。
6. 表示された GitHub Pages の URL にアクセスします。

Vite などのビルドツールは使っていないため、`dist` 生成は不要です。

## 将来の文字割り当て用構造

`src/main.js` には、後から 57,200 個の文字列を重複なしで割り当てるための土台として、以下を用意しています。

- `TextPatchRegistry`: 地面タイルと動物表面パッチを一元管理し、文字 ID の重複を検出します。
- `GroundTileManager`: 平原をタイル領域として登録します。
- `CreatureSilhouette.createPatchAnchors()`: 動物の胴体、頭、首、脚などに表面パッチのアンカーを登録します。

現段階では文字は描画していません。将来、回答テキストを読み込んだあと、`window.prototypePatchRegistry.assignUniqueTextUnits(textUnits)` に渡す形で割り当て処理を追加できます。

57,200 件を実表示する段階では、地面側は仮想タイルまたはチャンク化、動物表面側は表示距離に応じた間引きやインスタンス化を追加する想定です。
