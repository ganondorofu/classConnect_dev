
# ClassConnect 利用ガイド

ClassConnect（クラスコネクト）をご利用いただきありがとうございます。

## 1. ClassConnectとは？

ClassConnectは、クラスの時間割や日々の連絡事項、課題などを簡単に共有・確認できるウェブアプリケーションです。
先生と生徒間の情報伝達をスムーズにし、教室運営をサポートします。

### 主な機能

*   **時間割表示**: 週間の時間割を直感的に確認できます。当日のコマはハイライトされます。
*   **日々の連絡・変更**: 先生や権限を持つ生徒は、各コマの科目変更や持ち物などの連絡を簡単に入力できます。
*   **全体お知らせ**: 日付ごとにクラス全体へのお知らせ（Markdown対応）を掲載できます。AIによる要約機能も利用可能です。
*   **課題管理**: 課題の提出期限、内容、科目を登録し、一覧で管理できます。
*   **カレンダー**: 学校行事や課題の提出期限などを月間カレンダーで確認できます。
*   **管理者向け機能**:
    *   **科目管理**: 授業で使う科目をマスタとして登録・編集できます。
    *   **時間割設定**: 1日のコマ数や稼働曜日、学生の操作権限などを柔軟に設定できます。
    *   **お問い合わせ管理**: 学生からの問い合わせをチャット形式で一元管理できます。
    *   **変更履歴**: いつ、誰が、何を変更したかの操作ログを確認でき、一部操作は元に戻すことも可能です。
    *   **開発者向け機能**: クラスやユーザーの一括作成が可能です。

---

## 2. 利用規約

本アプリケーション ClassConnect (以下「本ツール」といいます) を利用される前に、以下の利用規約をよくお読みください。本ツールを利用することで、本規約に同意したものとみなします。

### 2.1 ツールの目的と免責事項

*   本ツールは、クラス内の情報共有を補助することを目的として提供されます。
*   本ツールの提供者は、本ツールの利用によって生じたいかなる損害（データの損失、業務の中断、その他の金銭的損害を含むがこれに限らない）についても、一切の責任を負いません。
*   本ツールは現状有姿で提供され、バグや障害がないこと、特定の目的に適合すること、第三者の権利を侵害しないことを保証するものではありません。

### 2.2 データの取り扱いと責任

*   本ツールに入力されたデータ（時間割、お知らせ、科目情報など）は、**所属するクラスの管理者および学生アカウントを持つユーザーのみが閲覧・編集可能**です。データの正確性、機密性については利用者の責任において管理してください。
*   **パスワードはハッシュ化されて保存されますが、他の個人情報を含むデータの取り扱いには十分注意してください。**

### 2.3 禁止事項

*   本ツールの意図的な妨害行為（不正なデータの入力、システムの脆弱性を利用した攻撃など）。
*   自身のアカウント情報を第三者と共有、譲渡、貸与する行為。
*   本ツールおよびそのデータを、クラス運営の目的を著しく逸脱する形で、むやみに外部に公開または共有する行為。
*   法令または公序良俗に違反する行為。

### 2.4 AI機能に関する注意

*   本ツールには、AI（人工知能）を利用した機能（お知らせの要約など）が含まれる場合があります。
*   AIによって生成された情報は、必ずしも正確または完全であるとは限りません。重要な判断を行う際は、必ず元の情報を確認し、ご自身の責任において利用してください。
*   AI機能の利用によって生じたいかなる結果についても、本ツールの提供者は責任を負いません。

### 2.5 規約の変更

*   本ツールの提供者は、必要に応じて本規約を変更できるものとします。変更後の規約は、本ツール上で表示された時点から効力を生じるものとします。

### 2.6 その他

*   本ツールの仕様は、予告なく変更されることがあります。

---

## 3. 困ったときは

*   **データが正しく表示されない、更新されない:**
    *   インターネット接続を確認してください。
    *   ブラウザを再読み込みしてみてください。
    *   それでも解決しない場合は、クラスの管理者にご連絡ください。
*   **ログインできない:**
    *   クラスコード、ユーザー名、パスワードが正しいか確認してください。大文字と小文字は区別されます。
    *   パスワードを忘れた場合は、クラスの管理者に連絡して再設定を依頼してください。

---

## 4. オープンソースライセンス (Open Source Licenses)

本アプリケーション ClassConnect は、以下のオープンソースソフトウェアを利用して開発されています。これらのソフトウェアのライセンス条件は、各ソフトウェアの公式サイトまたは配布元で確認できます。

*   **Next.js:** MIT License
*   **React:** MIT License
*   **Tailwind CSS:** MIT License
*   **Firebase SDKs (firebase, firebase-admin):** Apache License 2.0
*   **Genkit（および @genkit-ai パッケージ）:** Apache License 2.0
*   **Shadcn/UI (Radix UI, Lucide Reactなどを含む):** MIT License
*   **Tanstack Query:** MIT License
*   **date-fns:** MIT License
*   **Zod:** MIT License
*   **React Hook Form:** MIT License
*   **React Markdown:** MIT License
*   **clsx:** MIT License
*   **tailwind-merge:** MIT License

その他、多数の依存パッケージが含まれています。詳細は `node_modules` 配下の `LICENSE` ファイルや `package.json` をご確認ください。

---

## 5. システム構成と利用技術

ClassConnect は以下のような構成で開発・運用されています：

### デプロイ先

*   **Vercel**（Next.js アプリケーションホスティング）

### バックエンド・データサービス

*   **Firebase Authentication**（アプリ開発者認証）
*   **Firebase Firestore**（データベース: クラスデータ、ユーザー情報など）
*   **Google Gemini API**（AIによる要約・応答生成）

### 補助開発ツール・支援AI

*   **ChatGPT（OpenAI）**
*   **Firebase Studio**
