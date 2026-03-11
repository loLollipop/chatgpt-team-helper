diff --git a/backend/src/routes/gpt-accounts.js b/backend/src/routes/gpt-accounts.js
index 4191307dd38032c857911c9862e9f88ee5859ee8..82f0e8b17501e0fce79e5cecfbe216cd12b3c7f5 100644
--- a/backend/src/routes/gpt-accounts.js
+++ b/backend/src/routes/gpt-accounts.js
@@ -49,50 +49,116 @@ const formatExpireAt = (date) => {
 
 const normalizeExpireAt = (value) => {
   if (value == null) return null
   const raw = String(value).trim()
   if (!raw) return null
   if (EXPIRE_AT_REGEX.test(raw)) return raw
 
   // 支持 YYYY-MM-DD HH:mm:ss 或 YYYY/MM/DDTHH:mm:ss 格式
   const match = raw.match(/^(\d{4})[-/](\d{2})[-/](\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/)
   if (match) {
     const seconds = match[6] || '00'
     return `${match[1]}/${match[2]}/${match[3]} ${match[4]}:${match[5]}:${seconds}`
   }
 
   const asNumber = Number(raw)
   if (Number.isFinite(asNumber) && asNumber > 0) {
     const date = new Date(asNumber)
     if (!Number.isNaN(date.getTime())) {
       return formatExpireAt(date)
     }
   }
 
   return null
 }
 
+
+const decodeJwtPayloadSafely = (token) => {
+  const raw = String(token || '').trim().replace(/^Bearer\s+/i, '')
+  if (!raw) return null
+
+  const parts = raw.split('.')
+  if (parts.length < 2) return null
+
+  try {
+    const payloadSegment = parts[1].replace(/-/g, '+').replace(/_/g, '/')
+    const paddedPayload = payloadSegment.padEnd(Math.ceil(payloadSegment.length / 4) * 4, '=')
+    const decoded = Buffer.from(paddedPayload, 'base64').toString('utf-8')
+    const payload = JSON.parse(decoded)
+    return payload && typeof payload === 'object' ? payload : null
+  } catch {
+    return null
+  }
+}
+
+const inferEmailFromTokens = ({ accessToken, idToken }) => {
+  const idPayload = decodeJwtPayloadSafely(idToken)
+  const accessPayload = decodeJwtPayloadSafely(accessToken)
+  const candidates = [
+    idPayload?.email,
+    accessPayload?.email,
+    accessPayload?.preferred_username,
+    accessPayload?.upn
+  ]
+
+  for (const value of candidates) {
+    const normalized = normalizeEmail(value)
+    if (normalized) return normalized
+  }
+
+  return ''
+}
+
+const inferTokenHints = ({ accessToken, idToken }) => {
+  const idPayload = decodeJwtPayloadSafely(idToken)
+  const accessPayload = decodeJwtPayloadSafely(accessToken)
+  const idAuthClaims = idPayload?.['https://api.openai.com/auth'] || {}
+  const accessAuthClaims = accessPayload?.['https://api.openai.com/auth'] || {}
+
+  const inferredEmail = inferEmailFromTokens({ accessToken, idToken })
+  const accountIdCandidates = [
+    idAuthClaims?.chatgpt_account_id,
+    accessAuthClaims?.chatgpt_account_id,
+    idPayload?.chatgpt_account_id,
+    accessPayload?.chatgpt_account_id
+  ]
+
+  let inferredChatgptAccountId = ''
+  for (const value of accountIdCandidates) {
+    const normalized = String(value || '').trim()
+    if (normalized) {
+      inferredChatgptAccountId = normalized
+      break
+    }
+  }
+
+  return {
+    inferredEmail,
+    inferredChatgptAccountId
+  }
+}
+
 const collectEmails = (payload) => {
   if (!payload) return []
   if (Array.isArray(payload)) return payload
   if (Array.isArray(payload.emails)) return payload.emails
   if (typeof payload.emails === 'string') return [payload.emails]
   if (typeof payload.email === 'string') return [payload.email]
   return []
 }
 
 const CHECK_STATUS_ALLOWED_RANGE_DAYS = new Set([7, 15, 30])
 const MAX_CHECK_ACCOUNTS = 300
 const CHECK_STATUS_CONCURRENCY = 3
 
 const pad2 = (value) => String(value).padStart(2, '0')
 const EXPIRE_AT_PARSE_REGEX = /^(\d{4})[/-](\d{1,2})[/-](\d{1,2})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?$/
 const parseExpireAtToMs = (value) => {
   const raw = String(value ?? '').trim()
   if (!raw) return null
   const match = raw.match(EXPIRE_AT_PARSE_REGEX)
   if (!match) return null
 
   const year = Number(match[1])
   const month = Number(match[2])
   const day = Number(match[3])
   const hour = Number(match[4])
@@ -139,51 +205,51 @@ const eachWithConcurrency = async (items, concurrency, fn) => {
   if (!list.length) return
 
   let cursor = 0
   const workers = Array.from({ length: Math.min(limit, list.length) }).map(async () => {
     // eslint-disable-next-line no-constant-condition
     while (true) {
       const index = cursor++
       if (index >= list.length) break
       await fn(list[index], index)
     }
   })
 
   await Promise.all(workers)
 }
 
 const refreshAccessTokenWithRefreshToken = async (refreshToken) => {
   const normalized = String(refreshToken || '').trim()
   if (!normalized) {
     throw new AccountSyncError('该账号未配置 refresh token', 400)
   }
 
   const requestData = new URLSearchParams({
     grant_type: 'refresh_token',
     client_id: OPENAI_CLIENT_ID,
     refresh_token: normalized,
-    scope: 'openid profile email'
+    scope: 'openid profile email offline_access'
   }).toString()
 
   const requestOptions = {
     method: 'POST',
     url: 'https://auth.openai.com/oauth/token',
     headers: {
       'Content-Type': 'application/x-www-form-urlencoded',
       'Content-Length': requestData.length
     },
     data: requestData,
     timeout: 60000
   }
 
   try {
     const response = await axios(requestOptions)
     if (response.status !== 200 || !response.data?.access_token) {
       throw new AccountSyncError('刷新 token 失败，未返回有效凭证', 502)
     }
 
     const resultData = response.data
     return {
       accessToken: resultData.access_token,
       refreshToken: resultData.refresh_token || normalized,
       idToken: resultData.id_token,
       expiresIn: resultData.expires_in || 3600
@@ -401,67 +467,144 @@ router.post('/ban', apiKeyAuth, async (req, res) => {
               is_banned = 1,
               updated_at = DATETIME('now', 'localtime')
           WHERE LOWER(email) IN (${placeholders})
         `,
         emails
       )
       saveDatabase()
     }
 
     return res.json({
       message: 'ok',
       updated: matched.length,
       matched,
       notFound
     })
   } catch (error) {
     console.error('Ban GPT accounts by email error:', error)
     return res.status(500).json({ error: 'Internal server error' })
   }
 })
 
 router.use(authenticateToken, requireMenu('accounts'))
 
 // 校验 access token，并返回可用的 Team 账号列表（用于新建账号时选择 chatgptAccountId）
 router.post('/check-token', async (req, res) => {
+  let normalizedToken = ''
+  let normalizedRefreshToken = ''
+  let latestAccessToken = ''
+  let latestIdToken = ''
+  let refreshAttempted = false
+
   try {
-    const { token, proxy } = req.body || {}
-    const normalizedToken = String(token ?? '').trim()
+    const { token, refreshToken, proxy } = req.body || {}
+    normalizedToken = String(token ?? '').trim()
+    normalizedRefreshToken = String(refreshToken ?? '').trim()
+    latestAccessToken = normalizedToken
+
     if (!normalizedToken) {
       return res.status(400).json({ error: 'token is required' })
     }
 
-    const accounts = await fetchOpenAiAccountInfo(normalizedToken, proxy ?? null)
-    return res.json({ accounts })
+    try {
+      const accounts = await fetchOpenAiAccountInfo(normalizedToken, proxy ?? null)
+      const hints = inferTokenHints({ accessToken: normalizedToken })
+      return res.json({
+        accounts,
+        tokenRefreshed: false,
+        inferredEmail: hints.inferredEmail || null,
+        inferredChatgptAccountId: hints.inferredChatgptAccountId || null
+      })
+    } catch (error) {
+      const status = Number(error?.status || 0)
+      const message = String(error?.message || '')
+      const looksLikeExpiredToken = message.includes('Token 已过期或无效') || message.toLowerCase().includes('expired')
+      if ((status !== 401 && !looksLikeExpiredToken) || !normalizedRefreshToken) {
+        throw error
+      }
+
+      refreshAttempted = true
+      const refreshedTokens = await refreshAccessTokenWithRefreshToken(normalizedRefreshToken)
+      const refreshedAccessToken = String(refreshedTokens?.accessToken || '').trim()
+      latestAccessToken = refreshedAccessToken
+      latestIdToken = String(refreshedTokens?.idToken || '').trim()
+
+      if (!refreshedAccessToken) {
+        throw new AccountSyncError('刷新 token 失败：未返回新的 access token', 502)
+      }
+
+      let refreshedAccounts
+      try {
+        refreshedAccounts = await fetchOpenAiAccountInfo(refreshedAccessToken, proxy ?? null)
+      } catch (recheckError) {
+        const reStatus = Number(recheckError?.status || 0)
+        const reMessage = String(recheckError?.message || '')
+        if (reStatus === 401 || reMessage.includes('Token 已过期或无效')) {
+          throw new AccountSyncError('Access Token 已刷新，但仍校验失败：请确认 refresh token 与 access token 属于同一账号', 401)
+        }
+        throw recheckError
+      }
+
+      const hints = inferTokenHints({
+        accessToken: refreshedAccessToken,
+        idToken: refreshedTokens?.idToken
+      })
+
+      return res.json({
+        accounts: refreshedAccounts,
+        tokenRefreshed: true,
+        inferredEmail: hints.inferredEmail || null,
+        inferredChatgptAccountId: hints.inferredChatgptAccountId || null,
+        tokens: {
+          accessToken: refreshedAccessToken,
+          refreshToken: String(refreshedTokens?.refreshToken || normalizedRefreshToken).trim() || null
+        }
+      })
+    }
   } catch (error) {
     console.error('Check GPT token error:', error)
 
+    const hints = inferTokenHints({
+      accessToken: latestAccessToken || normalizedToken,
+      idToken: latestIdToken
+    })
+
     if (error instanceof AccountSyncError || error?.status) {
-      return res.status(error.status || 500).json({ error: error.message })
+      return res.status(error.status || 500).json({
+        error: error.message,
+        tokenRefreshedAttempted: refreshAttempted,
+        inferredEmail: hints.inferredEmail || null,
+        inferredChatgptAccountId: hints.inferredChatgptAccountId || null
+      })
     }
 
-    return res.status(500).json({ error: '内部服务器错误' })
+    return res.status(500).json({
+      error: '内部服务器错误',
+      tokenRefreshedAttempted: refreshAttempted,
+      inferredEmail: hints.inferredEmail || null,
+      inferredChatgptAccountId: hints.inferredChatgptAccountId || null
+    })
   }
 })
 
 // 批量检查指定时间范围内创建的账号状态（封号 / 过期 / 正常 / 失败）
 router.post('/check-status', async (req, res) => {
   try {
     const rangeDays = Number.parseInt(String(req.body?.rangeDays ?? ''), 10)
     if (!CHECK_STATUS_ALLOWED_RANGE_DAYS.has(rangeDays)) {
       return res.status(400).json({ error: 'rangeDays must be one of 7, 15, 30' })
     }
 
     const threshold = `-${rangeDays} days`
     const db = await getDatabase()
 
     const { totalEligible, accounts, truncated, skipped } = await loadAccountsForStatusCheck(db, { threshold })
     const nowMs = Date.now()
     const items = await mapWithConcurrency(accounts, CHECK_STATUS_CONCURRENCY, async (account) => {
       return await checkSingleAccountStatus(db, account, nowMs)
     })
 
     const summary = { normal: 0, expired: 0, banned: 0, failed: 0 }
     let refreshedCount = 0
     for (const item of items) {
       if (!item || typeof item.status !== 'string') continue
       if (Object.prototype.hasOwnProperty.call(summary, item.status)) {
