# Admin CMS 維運手冊

本手冊說明如何設定、部署及維護內建的 Markdown Admin CMS。系統直接讀寫 Blog 的 `main.md`，沒有資料庫；同目錄的有限版本只能供人工維護復原，並不是自動復原、audit 或備份服務。架構、安全邊界與遷移條件另見 [Admin CMS 架構與安全說明](./admin-cms-architecture.md)。

## 部署契約

啟用寫入前，環境必須同時符合下列條件：

- 只允許一個 Node.js process／container／pod 寫入同一份內容。
- `content/blog` 與 `content/.trash/blog` 必須位於同一個可持久化 filesystem；封存使用目錄 `rename`，不可把兩者掛成不同 volume。
- production container 以 `nextjs:nodejs`、UID/GID `1001:1001` 執行；掛載後的目錄也必須讓該身分可讀寫。
- 必須使用可保證同 filesystem 原子 `rename` 與可靠 `fsync` 的儲存層。
- 必須由 HTTPS 提供服務。Production cookie 具有 `Secure`，純 HTTP 不會送出登入 cookie。
- 不支援 serverless／edge ephemeral filesystem、多個 writable replicas 或跨區同時寫入。這些情境請改用資料庫與 object storage。

無法滿足契約時，明確設定 `ADMIN_CMS_WRITE_ENABLED=false`。文章列表、讀取與安全預覽仍可使用，但建立、更新及封存會回傳 `503 write_disabled`。

## 本機快速啟動

需求為 Node.js 22 與 pnpm 10.30.1。

1. 安裝依賴，產生每個環境專用的 JWT secret 與密碼 hash：

   ```bash
   pnpm install
   pnpm admin:generate-secret
   pnpm admin:hash-password
   ```

2. 將 `.env.example` 複製為不提交版控的 `.env.local`，替換兩個刻意無效的 placeholder，並確認本機路徑為：

   ```dotenv
   BLOG_CONTENT_DIRECTORY=./content/blog
   ```

   Docker image 會自行 override 為 `/app/content/blog`。同源本機開發可把範例 `ADMIN_ALLOWED_ORIGINS` 留空；production 必須移除 `cms.example.com` placeholder 或換成實際的精確 origin。

3. 設定 `ADMIN_USERS_JSON`。在 Next.js `.env.local` 中，scrypt hash 的每個 `$` 必須寫成 `\$`，避免被環境變數展開。例如：

   ```dotenv
   ADMIN_USERS_JSON=[{"username":"owner@example.com","displayName":"站長","role":"admin","passwordHash":"scrypt\$16384\$8\$5\$<salt>\$<derived-key>"},{"username":"editor@example.com","displayName":"內容編輯","role":"editor","passwordHash":"scrypt\$16384\$8\$5\$<salt>\$<derived-key>"}]
   ```

   `<salt>` 與 `<derived-key>` 只是示意，必須完整貼上 script 的輸出。若透過 shell、Docker `--env-file` 或 secret manager 直接注入，通常應使用原始 `$`，不要加入反斜線；請依該平台的 env parsing 規則確認實際值。

4. 啟動並登入：

   ```bash
   pnpm dev
   ```

   開啟 `http://localhost:3000/admin/login`。建立第一篇文章時先儲存草稿，再以 admin 帳號測試發布、取消發布及封存。

若只看到 `503 admin_unavailable`，代表 placeholder 尚未替換，或任一必要設定未通過 fail-closed 驗證；依下方環境變數表逐項檢查。

## Secret 與密碼 hash scripts

### JWT secret

```bash
pnpm admin:generate-secret
```

輸出為 32 個 CSPRNG random bytes 的 canonical base64url 字串。每個環境應使用不同值，並存於 secret manager；不得寫入 image、repository、issue、聊天紀錄或一般應用程式 log。

Production 還會拒絕非 canonical base64url、解碼後少於 32 bytes、內容多樣性不足，或含 `change-me`、`example`、`replace`、`development`、`secret` 等明顯 placeholder 的值。

### 使用者密碼 hash

```bash
pnpm admin:hash-password
```

script 使用 Node.js scrypt，參數為 `N=16384`、`r=8`、`p=5`、16-byte random salt 與 64-byte derived key。輸出只能放進 `ADMIN_USERS_JSON.passwordHash`，不可把明文密碼放進設定。

互動模式會隱藏輸入，也可由 secret manager 將密碼透過 stdin pipe 傳入。Script 會拒絕 command-line argument，避免明文出現在 shell history 或 process listing；產生後應立即把 hash 寫入 secret manager。

目前實作只接受完全符合上述參數的 hash；參數日後若調整，舊 hash 會被設定驗證拒絕，必須以新版 script 重新產生。

## 環境變數

### CMS 與 Blog runtime

| 變數 | 必要性／預設 | 規則與用途 |
|---|---|---|
| `ADMIN_JWT_SECRET` | Admin 必填 | UTF-8 至少 32 bytes；production 必須是 script 產生的強 base64url secret。 |
| `ADMIN_USERS_JSON` | Admin 必填 | 1–20 筆 strict JSON 使用者白名單；格式見下一節。 |
| `ADMIN_JWT_ISSUER` | `hayronhgh-admin-cms` | 寫入及驗證 JWT `iss`；變更會使既有 session 失效。 |
| `ADMIN_JWT_AUDIENCE` | `hayronhgh-admin-console` | 寫入及驗證 JWT `aud`；變更會使既有 session 失效。 |
| `ADMIN_TOKEN_TTL_SECONDS` | `3600` | 整數 `300`–`86400`；遭竊 token 最長有效時間也受此值影響。 |
| `ADMIN_ALLOWED_ORIGINS` | 空集合 | 逗號分隔、無 path 的完整 `http://`／`https://` origin；只填確實需要的額外來源，不接受 wildcard，也不是 CORS 開關。正常同源部署通常留空。 |
| `ADMIN_CMS_WRITE_ENABLED` | `true` | 只接受小寫 `true`／`false`。不符合單 writer 與 persistent volume 條件時設 `false`。 |
| `ADMIN_TRUST_PROXY_HEADERS` | `false` | 只接受小寫 `true`／`false`。僅在無法繞過、且會覆寫 client IP headers 的可信 proxy 後設 `true`。 |
| `BLOG_CONTENT_DIRECTORY` | `<cwd>/content/blog` | 公開 Blog 與 CMS 共用的文章根目錄；Docker image 設為 `/app/content/blog`。Production 建議用絕對路徑。 |

`BLOG_CONTENT_DIRECTORY` 的父目錄就是 CMS 的內容安全邊界；封存固定在其 sibling `.trash/blog`。例如 `/app/content/blog` 對應 `/app/content/.trash/blog`。

注意：runtime loader 會讀 `BLOG_CONTENT_DIRECTORY`，但目前 `pnpm validate:content` 仍驗證 repository 的 `<cwd>/content/blog`。若 production 使用其他絕對路徑，請先把 snapshot 掛載／複製到 repository 的 `content/blog` 再跑 validator，或在同一內容上執行等價的 deployment validation；不要誤把 repository 內的舊資料當成 live volume 驗證結果。

### 公開站台與 process runtime

| 變數 | 預設 | 說明 |
|---|---|---|
| `NEXT_PUBLIC_SITE_NAME` | `PortfolioKit` | 公開站名；不得放 secret。 |
| `NEXT_PUBLIC_SITE_URL` | `https://portfolio.example.com` | 公開 canonical base URL。 |
| `NEXT_PUBLIC_CONTACT_EMAIL` | `hello@example.com` | 公開聯絡信箱。 |
| `NODE_ENV` | 由 Next.js／image 管理 | `production` 會啟用強 secret 規則與 `Secure` cookie；不要用它繞過 production 驗證。 |
| `PORT` | Docker 為 `3000` | Next.js production server port。 |
| `NEXT_TELEMETRY_DISABLED` | Docker 為 `1` | 關閉 Next.js telemetry。 |

Docker build stage 另固定 `PNPM_HOME=/pnpm` 與 `PNPM_VERSION=10.30.1`；這兩項是 image build 細節，不是 CMS runtime secret。

## `ADMIN_USERS_JSON` 白名單

每筆使用者只接受下列欄位，未知欄位會讓整份設定失敗：

| 欄位 | 規則 |
|---|---|
| `username` | 必填，trim 後 3–128 字元，只接受英數及 `._@+-`；登入與重複檢查不分大小寫，runtime 會正規化為小寫。 |
| `displayName` | 選填，1–80 字元；省略時使用原始 username。 |
| `role` | 必填，只能是 `admin` 或 `editor`。 |
| `passwordHash` | 必填，必須是目前 `admin:hash-password` 產生的完整 scrypt hash。 |

設定允許全部都是 editor，但那會導致沒有人能發布、取消發布或封存。維運上至少保留一個可復原的 admin 帳號，並在套用變更前檢查 case-insensitive duplicate username。

只更換 `passwordHash` 不會撤銷已簽發的 JWT。若帳號或 token 疑似外洩，必須同時移除使用者／改變其 role，或旋轉 JWT secret。

## API 與 RBAC

所有回應都設定 `Cache-Control: no-store`。成功格式為 `{ "ok": true, "data": ... }`，失敗格式為 `{ "ok": false, "error": { "code", "message", "details"? } }`。

| Method | Path | editor | admin | 重要條件 |
|---|---|---|---|---|
| `POST` | `/api/admin/auth/login` | Public | Public | 強制 Origin；JSON 上限 8 KiB；成功設定 session cookie。 |
| `POST` | `/api/admin/auth/logout` | 可 | 可 | 需 session 與 Origin；清除目前瀏覽器 cookie。 |
| `GET` | `/api/admin/session` | 可 | 可 | 回傳 `expiresAt` 與 user。 |
| `GET` | `/api/admin/posts?q=&status=all|draft|published` | 可 | 可 | `q` 最多 100 字元；依 `updatedAt` 新到舊。 |
| `POST` | `/api/admin/posts` | 僅建立草稿 | 建立草稿或直接發布 | 需 Origin 且 write enabled；成功為 `201`。 |
| `GET` | `/api/admin/posts/<slug>` | 可 | 可 | 取得正文、revision 與 metadata；帶唯一的 `?view=revision` 時只回傳心跳需要的 revision／updatedAt。 |
| `PUT` | `/api/admin/posts/<slug>` | 僅既有 draft → draft | 可修改 draft／published、發布或取消發布 | 需 Origin、write enabled 與目前 revision；`saveMode=manual|autosave`，舊 client 省略時預設 manual；autosave 不可改變發布狀態。 |
| `DELETE` | `/api/admin/posts/<slug>` | 不可 | 可 | 需 Origin 與 write enabled；是可復原封存，不是永久刪除。 |
| `POST` | `/api/admin/preview` | 可 | 可 | 需 Origin；沿用公開 Blog sanitizer；read-only 部署仍可用。 |

Cookie 名稱為 `admin_session`，具有 `HttpOnly`、`SameSite=Strict`、`Path=/`，production 另有 `Secure`。JWT 僅接受 HS256，並驗證 issuer、audience、issued-at、expiry、JTI、username 與 role；每次 request 都會重新確認使用者仍在白名單且 role 相符。

所有非 GET 路由都要求有效 `Origin`，且 `Sec-Fetch-Site: cross-site` 會被拒絕。Reverse proxy 必須保留正確的 scheme／Host；TLS termination 導致 request URL 與瀏覽器 Origin 不一致時，才將精確外部 origin 加入 `ADMIN_ALLOWED_ORIGINS`。

### 文章輸入限制

- 新文章 `slug`：1–2 層小寫 kebab-case；每層最多 64、總長最多 129。拒絕 `%`、反斜線、空白、path traversal 及 Windows reserved names。
- 既有文章相容性：Admin 不會要求重新命名舊目錄；可原樣列出及管理 1–2 層的大小寫、點號、括號、內部空格、底線與 Unicode slug，例如 `CaseStudy`、`LeetCodeEssential150/1.TwoSums`、`8.StringToInteger(atoi)`、`LeetCode/模板`、`155.Min Stack`。這只適用於 filesystem 已存在的文章；建立新文章仍使用上述 canonical 規則。Legacy parser 仍拒絕空 segment、前後空白、`.`／`..`、slash／backslash、percent ambiguity、控制字元、Windows reserved names、超長與超過兩層的路徑。
- `title`：1–160 字元；`description`：1–500 字元。
- `content`：trim 後 1–500,000 字元；整份 JSON 另受 512 KiB byte limit 限制，因此大量非 ASCII 內容可能先碰到 byte limit。
- `date`：真實的 `YYYY-MM-DD` 日曆日期。
- `tags`：最多 20 筆，每筆 1–40 字元且不可含 CR/LF；UI 以一行一個標籤輸入，標籤本身可含逗號。寫入時去除完全相同的重複值。
- `published`：boolean。
- 更新另需 64 字元小寫 SHA-256 `revision`；預覽只接受 `slug` 與 `content`。

## 編輯器即時同步、儲存與版本

### 一秒 debounce 自動儲存

選取已存在、且已取得 server revision 的文章後，表單每次修改都會重新開始 1 秒 debounce；最後一次符合資格的修改停滿 1 秒，瀏覽器就以 `saveMode=autosave` 更新目前的 `main.md`。它不是固定每秒寫檔，也不會替尚未建立的文章自動送出第一筆資料。

自動儲存只會在表單有效、頁面可見、瀏覽器 online、沒有其他 mutation／lifecycle action、沒有 revision conflict，且目前使用者有權修改該文章時執行。安全預覽是 read-only request，可和 autosave 同時更新，不會讓其中一方再多等一個 debounce 週期。新文章還沒有 slug 對應的 server revision，必須先按「手動儲存版本」建立 `main.md`；第一次建立沒有舊檔可供輪替。

自動儲存只原子更新最新的 `main.md`，不建立、移動或改寫 `main.1.md`～`main.4.md`。自動儲存也不會改變 `published` lifecycle；發布與取消發布仍是明確的手動操作。Admin 修改已發布文章並完成自動或手動儲存後，公開 Blog 的 dynamic loader 會讀到新的 `main.md`，不需重建 image；因此已發布內容的修改會直接反映到公開頁。

Markdown 內容或 slug 停止變動 1 秒後，右側安全預覽也會自動重新解析；desktop 可維持 editor／preview 並排，mobile 不會被背景更新強制切換分頁。每個請求都帶本次輸入快照的 sequence，較慢完成的舊預覽不會覆蓋較新的內容。Autosave 成功後只更新 revision／儲存狀態，不會把 server 正規化後的尾端換行重新灌回 textarea，因此游標、選取範圍與正在輸入的內容不會因回應跳動。

### 每秒 revision 心跳與衝突保護

登入後，只要選取既有文章、頁面可見且瀏覽器 online，編輯器就每 1 秒對 `GET /api/admin/posts/<slug>?view=revision` 發送一次受認證的輕量心跳。回應只含 `revision` 與 `updatedAt`；頁面隱藏或 offline 時會暫停。這是 near-real-time polling，不是 WebSocket、多人游標同步或共同編輯協定。

- 遠端 revision 相同：維持目前表單。
- 遠端 revision 不同、且本機表單乾淨也沒有儲存進行中：重新載入最新的 `main.md`。
- 遠端 revision 不同、且本機有未儲存修改或儲存進行中：保留本機內容、標示 conflict 並暫停自動儲存，絕不以遠端內容靜默覆蓋本機草稿。

所有寫入仍在 server 端比較 SHA-256 revision；即使心跳剛好尚未看到更新，舊 revision 的寫入仍會得到 `409 revision_conflict`。發生衝突時，先把本機草稿複製到安全位置，再重新載入遠端版本並人工合併，不要反覆重送舊 revision。

### 手動儲存的五份 filesystem 版本

對既有文章執行手動儲存，或執行發布／取消發布 transition 時，server 會先輪替目前檔案，再原子寫入新的 `main.md`：

```text
content/blog/<slug>/
  main.md    # 最新、唯一的 live 版本
  main.1.md  # 最近一次手動／lifecycle 寫入前的 main.md
  main.2.md
  main.3.md
  main.4.md  # 最舊保留版本
```

輪替方向為 `main.3.md → main.4.md`、`main.2.md → main.3.md`、`main.1.md → main.2.md`、原 `main.md → main.1.md`；超過範圍的最舊快照會被淘汰。因此「目前 `main.md` + 四份歷史檔」合計最多五份。若先發生多次自動儲存，下一次手動儲存會把當時最新的 `main.md` 保存成 `main.1.md`。

Server 會先把新版及完整 rollback bytes 寫入同目錄暫存檔並 `fsync`，全部成功才開始更換 live paths；一般 I/O error 會嘗試將五個路徑完整還原。這仍沒有 durable transaction journal：若 process／主機在多次 rename 中間被強制終止，維護者必須依下方人工復原程序與外部備份檢查版本集合。

這些檔案位於 live article 的同一 persistent volume，會隨整個文章目錄一起封存，也已由 Git 與 Docker build context 忽略。它們沒有 actor、reason、diff、不可變性或異地副本，volume 遺失時會和 `main.md` 一起消失，所以不是 backup、完整 revision history 或 audit log。

### Markdown Undo／Redo

Markdown 正文編輯器在目前瀏覽器分頁內提供本機 undo／redo：

- `Ctrl+Z`／`Cmd+Z`：undo。
- `Ctrl+Shift+Z`／`Cmd+Shift+Z` 或 `Ctrl+Y`／`Cmd+Y`：redo。

這份 history 只保護目前 Markdown 編輯工作，文章切換或完整 reload 時就會重設；它不會寫入 server，也不會跨分頁、瀏覽器或裝置同步。Undo／redo 不能取代手動版本、backup 或 audit，分頁 crash／關閉後也不應把它當成可復原來源。

## `description` 與 Markdown `summary` mapping

Admin API／TypeScript model 使用 `description`，公開 Blog frontmatter 使用 `summary`。兩者是同一欄位：

| Admin 欄位 | `main.md` 儲存位置 |
|---|---|
| `slug` | `content/blog/<slug>/` 目錄；不寫入 frontmatter |
| `title` | `title` |
| `date` | `date` |
| `description` | `summary` |
| `tags` | `tags` |
| `published` | `published` |
| `content` | frontmatter 後的 Markdown body |
| `revision` | 整份原始 `main.md` 的 SHA-256；不寫入檔案 |
| `updatedAt` | `main.md` mtime；不寫入檔案 |

不要另外加入 `description:` frontmatter；公開 loader 不會把它當摘要。外部工具只要改動 `main.md` 的任何 byte（包含未知 metadata、註解或換行），revision 都會改變，舊編輯畫面下一次儲存便會收到 `409 revision_conflict`。

新文章只寫入 `title`、`date`、`summary`、`tags`、`published` 與 body。更新文章時，CMS 只重寫這五個 managed fields 與 body；`relatedProjects`、`series`、`featuredRank`、`order`、`coverImage` 和其他 passthrough frontmatter raw lines 會保留，但可能被移到 managed block 之後。若工作流程依賴這些欄位，更新後仍應跑內容驗證。

## Docker 與 persistent volume

Production image 以 non-root UID/GID `1001:1001` 執行，並在 image 內準備 `/app/content/blog` 與 `/app/content/.trash/blog`。Bind mount 會遮蔽 image 內的 owner 與初始內容，因此 host 資料必須先 seed 並自行設定 ACL／ownership。

建議把整個 `/app/content` 掛成一個 persistent volume，而非只掛 Blog：

```bash
docker run --rm -p 3000:3000 \
  --env-file /secure/path/admin-cms.env \
  --mount type=bind,source=/srv/portfolio/content,target=/app/content \
  portfolio-kit
```

部署前應確認：

```bash
chown -R 1001:1001 /srv/portfolio/content
test -w /srv/portfolio/content/blog
test -w /srv/portfolio/content/.trash/blog
```

Rootless Docker、Docker Desktop、NFS 或 Kubernetes 的 UID mapping 可能不同；請用該平台的 ACL、`runAsUser: 1001`／`runAsGroup: 1001`／適當 `fsGroup` 解決，不要把 container 改回 root。至少以 container 實際身分檢查：

```bash
docker exec <container> id
docker exec <container> sh -lc 'ls -ld /app/content /app/content/blog /app/content/.trash/blog && test -w /app/content/blog && test -w /app/content/.trash/blog'
```

封存會從 Blog 目錄 `rename` 到 `.trash/blog`。若兩者是兩個 mount，即使都可寫，也可能出現 `EXDEV` 並回傳 generic `500`；必須使用同一 persistent volume／filesystem。

不要使用 serverless ephemeral filesystem：寫入可能唯讀、在下一次 invocation 消失，且每個 invocation 的 in-memory mutation queue 與 rate limit 都彼此獨立。多 replica 即使共用 ReadWriteMany volume 也沒有 distributed lock，仍不支援同時寫入。

## 備份與整體復原

Repository 沒有 backup script；`pnpm package:dist` 明確不包含 `content/`，不能當備份。

一致性備份流程：

1. 將唯一 writer 的 `ADMIN_CMS_WRITE_ENABLED` 設為 `false` 並重新啟動，或暫停該 instance。只改 secret manager 而不 restart，不保證 process 已取得新值。
2. 對整個 persistent `content/` 做單一 volume snapshot，或在 quiesced 狀態建立 archive。必須包含隱藏的 `content/.trash/`、文章附件、site 與 projects；不要用可能漏掉 dot-directory 的 `content/*` glob。
3. 保留 owner、mode、mtime，產生 checksum，並將備份加密後異地保存。JWT secret、`ADMIN_USERS_JSON` 與其他 deployment config 另存於 secret manager，不與公開內容備份混放。
4. 定期在隔離環境做 restore drill，執行 `pnpm validate:content`、啟動 smoke test，並確認 draft 不會意外公開。

在常見 tar 工具中，可用下列形式確保整個目錄（含 `.trash`）都被納入：

```bash
tar -czf "portfolio-content-$(date +%Y%m%d-%H%M%S).tgz" -C /srv/portfolio content
sha256sum portfolio-content-*.tgz
```

整體復原時先停 writer，把目前目錄以可回復方式移開，再解壓備份；恢復 `1001:1001` 權限並驗證內容後才重新開放寫入。不要直接把不完整 snapshot 覆蓋到 live volume。

### 從 `main.N.md` 人工復原單篇文章

這是維護窗口內的最後手段，目前沒有一鍵 restore API／UI。不可在 Admin 仍可能自動儲存或執行 lifecycle action 時直接複製檔案：

1. 停止唯一 writer，或設定 `ADMIN_CMS_WRITE_ENABLED=false` 並 restart；確認所有 mutation 已停止，且在程序完成前不要重新開放編輯。
2. 先把整個文章目錄及目前的 `main.md` 複製到 live volume 以外的受控儲存位置，保留 owner／mode／mtime 並記錄 checksum。`main.1.md`～`main.4.md` 與 live 檔同 volume，不能當這一步的外部備份。
3. 選定一個 `main.N.md`，確認它位於正確文章目錄、是一般檔案而非 symlink，並人工檢查 frontmatter、Markdown body、`published` 狀態與 checksum。若來源不完整或 slug／內容不符，停止操作。
4. 使用支援 same-directory atomic replacement 的維護工具：先把選定版本複製到 `main.md` 同目錄的隨機 temporary file，寫完後 `fsync`／close、設定正確 owner 與 mode，再以同 filesystem `rename` 原子取代 `main.md`。不要把資料直接串流寫進 live `main.md`，也不要在此步驟輪替或刪除其他 history files。
5. 對實際 live content 執行 `pnpm validate:content` 或部署環境的等價驗證，確認新 `main.md` 可解析，再以 write-disabled instance 檢查 Admin read／preview 與公開 Blog。若 live root 不是 repository 的 `content/blog`，依本手冊的 runtime loader 注意事項，把同一份 snapshot 掛載／複製到 validator 實際檢查的位置。復原來源若是 `published: true`，重新提供服務後會立即成為公開內容；需要審稿時，必須在離線狀態先改為 draft、重新原子寫入並再次驗證。
6. 驗證通過後才重新開啟唯一 writer。既有編輯分頁會透過 revision 心跳看到變更：乾淨表單可同步，dirty 表單會進入 conflict 並保留本機內容；不要要求使用者強制覆蓋復原結果。

## 封存 manifest 與人工復原

`DELETE` 不是永久刪除。預設封存結構為：

```text
content/.trash/blog/<archiveId>/
  archive.json
  <slug>/
    main.md
    main.1.md ... main.4.md（若曾建立）
    ...文章目錄內的附件
```

兩層 slug 會保留兩層目錄。`archiveId` 格式為 `<archivedAt 的 epoch milliseconds>-<UUID>`；`archive.json` 只有：

```json
{
  "archiveId": "1780000000000-00000000-0000-4000-8000-000000000000",
  "archivedAt": "2026-05-28T20:26:40.000Z",
  "slug": "engineering/admin-cms"
}
```

整個文章目錄會被移入封存區，所以現有的 `main.1.md`～`main.4.md` 也會同行。Autosave 或封存本身都不會另外建立版本。現在仍沒有 archive listing、restore API／UI／script、checksum、操作者／原因 audit 欄位或自動 retention；封存區和 live content 在同一 volume，故封存不是備份。

人工復原程序：

1. 停止唯一 writer，或設 `ADMIN_CMS_WRITE_ENABLED=false` 後 restart。
2. 先備份整個 `content/`。讀取 `archive.json`，確認目錄名等於 `archiveId`，`slug` 符合前述既有文章的 1–2 層 legacy-safe 規則，並人工檢查封存目錄內的 `main.md` 與附件；不要為了還原而重新命名舊 slug。
3. 確認 `content/blog/<slug>` 完全不存在。若目的地已存在，停止操作並人工合併；絕不可 overwrite。兩層 slug 的父目錄可以存在，但父目錄不可有自己的 `main.md`。
4. 必要時建立沒有 `main.md` 的父目錄，再把 `<archiveRoot>/<slug>` 整個目錄 move 回 `content/blog/<slug>`。來源與目的必須在同 filesystem。
5. 驗證檔案 owner／mode，執行 `pnpm validate:content`，再以 read-only instance 檢查 Admin 列表、預覽與公開頁。若復原檔為 `published: true`，恢復服務後會立即公開；需要先審稿時應在離線狀態改為 `published: false` 並重新驗證。
6. 確認 production 正常且另有備份後，才清理只剩 manifest 的 archive root；或把 manifest 移入受控的 audit archive。不要先刪 manifest。

## Secret rotation 與白名單移除

### 旋轉 JWT secret

1. 安排維護窗口，暫停寫入。
2. 執行 `pnpm admin:generate-secret`，把新值寫入 secret manager。
3. 重新啟動唯一 writer；不要長時間同時接受新舊 secret，現有實作也不支援多 key verification。
4. 以 admin 與 editor 各測試一次登入和 RBAC，再恢復寫入。

旋轉後所有舊 cookie 立即失效，使用者需重新登入。不要為了 rollback 再啟用可能已外洩的舊 secret；應產生另一組新值。

### 移除使用者或 origin

1. 從 `ADMIN_USERS_JSON` 移除整筆使用者，或調整 role；套用前確認仍有至少一名 admin。
2. 重新啟動 instance。JWT 每次都會重查 username 與 role，因此被移除使用者或 role 不相符的舊 token 會失效。
3. 若懷疑 JWT 已被複製，同時旋轉 JWT secret；若只懷疑密碼外洩，另產生新 hash。單純更換 password hash 不會撤銷既有 token。
4. 移除 `ADMIN_ALLOWED_ORIGINS` 中不再使用的精確 origin 並 restart；確認 reverse proxy 的 Host／scheme 仍與公開 URL 一致。

Logout 只刪除當前瀏覽器 cookie，沒有 server-side JTI denylist，不能作為遭竊 token 的全域撤銷機制。

## Troubleshooting

先看 JSON `error.code`，再查 server log；未知 filesystem 例外只對 client 顯示 generic `500 internal_error`，不會暴露 stack 或絕對路徑。

| 現象 | 常見原因 | 處理方式 |
|---|---|---|
| `401 invalid_credentials` | username／密碼錯誤，或 username 不在白名單 | 檢查 case-insensitive username、以目前 script 重新產生 hash；不要從訊息判斷帳號是否存在，錯誤刻意一致。 |
| `401 unauthorized` | cookie 缺失／過期、secret／issuer／audience 已旋轉、使用者移除或 role 改變 | 重新登入；確認 HTTPS 與 `Secure` cookie、系統時間、目前 deployment env。 |
| `403 invalid_origin` | 缺少 Origin、cross-site request、proxy 的 scheme／Host 與瀏覽器 Origin 不一致，或 allowlist 少了精確 origin | 不要停用檢查；修正 proxy，必要時加入無 path 的 exact origin。 |
| `403 forbidden` | editor 嘗試發布、取消發布、修改已發布文章或封存 | 改以 admin 執行 consequential action；不要只隱藏 UI，API 已強制 RBAC。 |
| `409 revision_conflict` | 載入後檔案被另一畫面、Git sync 或人工編輯修改 | 先複製本機草稿，重新載入目前版本，人工合併後再存；不要重送舊 revision。details 含 `currentRevision`、`currentUpdatedAt`。 |
| 其他 `409` | `slug_exists`、父 slug 已是文章，或現有 path 型態／symlink 不安全 | 選新 slug；檢查一層文章與兩層 series 衝突，勿強制覆蓋。 |
| `413 request_too_large` | Login 超過 8 KiB，或其他 JSON 超過 512 KiB；UTF-8 多 byte 內容先達上限 | 縮短 Markdown／payload、把大型媒體改成受控附件；同步確認 proxy limit 不低於 app，但不要把 app limit 任意放大。 |
| `415 unsupported_media_type` | `Content-Type` 不是 `application/json` | 設定 `Content-Type: application/json`；可帶 charset。 |
| `503 admin_unavailable` | secret／users JSON 缺失或格式錯誤、production secret 太弱、TTL／boolean／origin 無效 | 對照 env 表與 server log；`.env.example` placeholder 刻意不可用。 |
| `503 write_disabled` | `ADMIN_CMS_WRITE_ENABLED=false` | 若部署符合單 writer、same-filesystem persistent volume 契約，再經變更流程開啟；不要只為消除錯誤而改成 true。 |
| server log `EACCES`，client `500` | bind volume 被 root／其他 UID 擁有，或 ACL／read-only mount 阻擋 UID 1001 | 在 container 內執行 `id`、`ls -ld`、`test -w`；修正 host ownership／ACL 或 Kubernetes security context。 |
| server log `EXDEV`，client `500` | Blog 與 `.trash` 位於不同 mount，封存無法原子 rename | 改用單一 `/app/content` volume；不要用 copy+delete 取代而破壞 recoverable archive 契約。 |
| `429 too_many_attempts`／`login_busy` | 15 分鐘登入 bucket 達上限，或 scrypt 同時／排隊數已滿 | 等待 `details.retryAfterSeconds`、調查攻擊流量；回應目前沒有 `Retry-After` header。只在可信 ingress 後開 proxy header trust。 |

其他可見錯誤包括 `400` invalid JSON／query／slug、`404 article_not_found`、`422 validation_error`（details 有欄位 path/message）與 `500 invalid_article_source`／unsafe content roots。`405 Method Not Allowed` 由 framework 處理，不保證使用 CMS JSON envelope。

## Login limiter 維運限制

Limiter 是每個 process 的 15 分鐘 in-memory state，restart 會清除，也不會跨 replica 同步：

- `ADMIN_TRUST_PROXY_HEADERS=true`：每 client 30 次、client+username 5 次、username 全域 100 次失敗。
- `false`：所有直連流量共用 100 次 client bucket，另有每 username 100 次；這避免相信可偽造 header，但精度較低。
- 最多 4 個 scrypt 同時計算、20 個排隊；超過即 `429 login_busy`。

只有當 ingress 阻止 client 繞過 proxy，並清除後重設 `X-Real-IP`／`X-Forwarded-For` 時才能開啟 trust。實作優先取 `X-Real-IP`，否則取 `X-Forwarded-For` 最後一項；proxy chain 必須與此契約一致。

## 驗證、CI 與已知狀態

本機完整 gate：

```bash
pnpm check
```

它會執行 production dependency audit、typecheck、content validation、unit tests、lint、production build 與 `git diff --check`。CI 另做 committed-secret pattern scan、Docker image build，並以 UID/GID 1001 對 named volume 的 Blog／trash 目錄做實際 write smoke。

Production dependency audit 目前為 0。完整 development-tree audit 仍會回報 dev-only `ESLint → minimatch 3 → brace-expansion` advisory；強制升至 brace-expansion v5 會破壞該舊 consumer 的 API，因此 CI gate 使用 `pnpm audit:prod`，並等待上游 minimatch 3 consumer 升級。這不是 production runtime dependency，但仍須在依賴更新時持續追蹤，不應用不相容 override 隱藏。

### 尚未完成的實機驗證

- Production persistent volume 組態尚未在本機 Docker 實際啟動並走完登入、寫入、封存及重啟後持久化流程；CI 的 image user／write smoke 不等同完整 production volume 驗證。
- Admin UI 的 360 px、768 px、1280 px 等 viewport 尚未使用 Codex in-app Browser 實測；目前只有 responsive code 與元件狀態證據，不能宣稱已完成 viewport QA 或提供正式 screenshots。

上線前應補做這兩項驗證，並保存測試日期、image digest、volume driver、browser／viewport 與結果。
