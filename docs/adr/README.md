# 公開用 Architecture Decision Records

公開版では、投資判断の詳細ではなく、Project Big Testerの技術選定、安全設計、検証と改善の意思決定を記録しています。
内部では31件ほどADRを管理していますが、機微な情報を含むため、代表的な5件だけサニタイズして公開しています。

| # | タイトル | 状態 |
| --- | --- | --- |
| [0003](0003-secret-management-validation.md) | シークレット管理: 検証に基づくSSM Standard採用と防御策修正 | Accepted |
| [0014](0014-data-foundation-migration.md) | SQLiteからPostgreSQL・TimescaleDB・Parquetへの段階的移行 | Accepted |
| [0018](0018-ai-role-separation.md) | AIモデルの役割分離とリアルタイム経路からの除外 | Accepted |
| [0022](0022-safety-cost-control.md) | コスト異常を起点とした安全・コスト制御の強化 | Accepted |
| [0031](0031-exit-candidate-authority-boundary.md) | Exit候補生成と人間承認を分離するAuthority Boundary | Accepted |

各文書は公開用に要約しており、認証値、外部接続先、実データ、投資戦略、具体的な売買条件は含みません。
