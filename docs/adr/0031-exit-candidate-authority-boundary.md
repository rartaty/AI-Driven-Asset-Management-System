# ADR-0031: Exit候補生成と人間承認のAuthority Boundary

- **Status**: Accepted
- **Decision**: AIまたはシステムはExit候補を生成できるが、自動売却は行わない。

## Authority Boundary

候補生成は`report-only`に限定する。

- APIによる発注を行わない
- PaperTraderによる発注を行わない
- 手動Triggerで実行する
- 結果はReport Archiveへ記録する

## Trade-off

候補生成にはHuman Approvalが必要であり、候補から自動的に注文へ進む経路は持たない。この制約は自動化の即時性を下げる一方、不可逆な資産操作に対する説明可能性と運用者の最終判断を守る。