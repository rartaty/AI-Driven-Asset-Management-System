# Project Big Tester

**Project Big Tester** は、銀行・証券の資産情報、ポートフォリオ、資産推移、システム状態を統合し、AI支援とリスク管理を組み合わせてローカル環境で運用する個人向け資産管理・自動運用プラットフォームです。

本リポジトリは、実システムから個人情報、実データ、認証情報、投資判断ロジックを除外した**サニタイズ済み技術公開版**です。生成されたデモではありません。

---

## 主な機能 (Core Features)

- **資産管理・可視化**: 銀行・証券の残高、保有状況、評価損益、資産推移、システム状態をダッシュボードで扱う設計です。
- **自動運用基盤**: 市場時間や状態に応じ、データ取得、状態更新、分析、レポート作成をスケジュール実行する設計です。
- **AI支援**: 市場コンテキストの分析、状態評価、事後レポートを補助します。実行経路と分析経路は分離します。
- **リスク管理**: 異常時の新規実行を抑止するフェイルセーフ、監査性、生活資金と運用判断の分離を重視します。

銘柄選定、売買シグナル、評価式、閾値、配分、発注、最適化、バックテストは非公開です。

---

## 技術スタック (Technology Stack)

### Backend

- **言語/フレームワーク**: Python 3.11 / FastAPI / Pydantic
- **ORM**: SQLAlchemy 2.0
- **タスクスケジューリング**: APSchedulerを用いた時間ベースの処理設計
- **データ処理**: pandasおよび市場データ連携を用いる設計
- **共通基盤**: 設定読込、サーバー側認可、レート制限、構造化ログ、コスト保護

### Frontend

- **言語/フレームワーク**: Next.js 16 / React 19 / TypeScript
- **スタイリング**: CSS Modules
- **可視化**: Recharts
- **画面**: ポートフォリオ、分析、監視、レポート、タイムライン

### API / External Integrations

- **市場・企業データ**: 証券APIおよび市場データサービスと連携する設計
- **AI**: 市場コンテキスト分析、状態評価、事後レポートの補助
- **通知**: 運用状態・異常・処理結果を通知チャネルへ連携する設計
- **シークレット管理**: AWS Systems Manager Parameter Store / KMS

---

## プロジェクト構成 (Project Structure)

```text
.
├── frontend/                 # 実ダッシュボードとAPIプロキシ境界
├── backend/
│   ├── src/core/             # 設定、認可、レート制限、ログ、コスト保護
│   ├── src/models/           # DB接続と公開可能なAPIスキーマ
│   └── requirements.txt      # Backend依存関係
├── docker/postgres/          # DB初期化
├── docs/                     # 公開用要件・仕様・設計資料
├── scripts/                  # 公開版の確認スクリプト
└── docker-compose.yml        # ローカルインフラ構成
```

公開版からは、口座接続、発注、投資判断、バックテスト、実データ、内部資料を除外しています。

---

## 環境構築

### 開発環境

- Windows 11 / PowerShell 5.1以上
- Python 3.11以上
- Node.js 20.9以上
- PodmanまたはDocker（DBコンテナ構成を確認する場合）
- AWS CLI（非公開の実運用環境でSSMを利用する場合のみ）

### シークレットの準備

実システムでは認証情報をソースコードに保存せず、実行時にSSM/KMSの管理境界から取得します。公開版には実行時設定、口座接続、発注モジュールを含めないため、実口座用の環境変数や認証情報を設定する必要はありません。

### シークレット検出 pre-commit hook の配線

```powershell
cd backend
python -m pip install -r requirements.txt
pre-commit install
pre-commit run --all-files
```

### 起動スクリプトの実行

```powershell
.\scripts\start-public-review.ps1
```

このスクリプトは公開版のFrontend確認用サーバーだけを起動します。外部API接続、実口座接続、発注は行いません。

---

## セキュリティと運用ルール

1. **`TRADE_MODE=REAL` の無断切替禁止**: 仮想取引から実運用への切替は、運用者の明示的な確認なしには行わない設計です。
2. **APIキー等の平文埋め込み禁止**: APIキー、トークン、パスワード、証明書をGitへcommitしてはいけません。
3. **キルスイッチの無断解除禁止**: 安全装置の復旧は、自動的に行わず、運用者による明示的で監査可能な操作として扱います。

---

## 関連ドキュメント

- [要件定義](docs/REQUIREMENTS_DEFINITION.md)
- [技術仕様](docs/TECHNICAL_SPECIFICATION.md)
- [アーキテクチャ設計](docs/architecture/README.md)
- [運用・SRE設計](docs/operations/README.md)
- [アーキテクチャ決定記録 (ADR)](docs/adr/README.md)

---

*Disclaimer: 本リポジトリは技術公開を目的としたものであり、投資助言、金融サービスの提供、金融取引の実行を目的とするものではありません。*