diff --git a/frontend/src/views/AccountsView.vue b/frontend/src/views/AccountsView.vue
index 29cbff36613b468b3cc558230a6780dc30e79469..82d629a328f64ab29ef3ed1a082e2631226f6a5d 100644
--- a/frontend/src/views/AccountsView.vue
+++ b/frontend/src/views/AccountsView.vue
@@ -500,72 +500,111 @@ const applyCheckedAccountSelection = (accountId: string) => {
 }
 
 const openChatgptIdDropdown = async () => {
   await nextTick()
   const el = document.getElementById('chatgpt-account-id-input') as HTMLInputElement | null
   el?.focus()
   try {
     // Best-effort: trigger the browser's datalist dropdown.
     el?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }))
   } catch {
     // ignore
   }
 }
 
 const handleCheckAccessToken = async () => {
   const token = String(formData.value.token || '').trim()
   if (!token) {
     showErrorToast('请先填写 Access Token')
     return
   }
 
   try {
     checkingAccessToken.value = true
     checkAccessTokenError.value = ''
 
-    const result = await gptAccountService.checkAccessToken(token)
+    const refreshToken = String(formData.value.refreshToken || '').trim()
+    const result = await gptAccountService.checkAccessToken(token, refreshToken || undefined)
     checkedChatgptAccounts.value = Array.isArray(result?.accounts) ? result.accounts : []
 
+    if (result?.tokenRefreshed && result?.tokens?.accessToken) {
+      formData.value.token = String(result.tokens.accessToken || '').trim()
+      if (result?.tokens?.refreshToken) {
+        formData.value.refreshToken = String(result.tokens.refreshToken || '').trim()
+      }
+    }
+
+    if (result?.inferredEmail) {
+      formData.value.email = String(result.inferredEmail || '').trim()
+    }
+
+    if (result?.inferredChatgptAccountId && !String(formData.value.chatgptAccountId || '').trim()) {
+      formData.value.chatgptAccountId = String(result.inferredChatgptAccountId || '').trim()
+    }
+
     if (!checkedChatgptAccounts.value.length) {
-      showErrorToast('校验成功，但未返回可用账号（可能没有 Team 账号权限）')
+      if (String(formData.value.chatgptAccountId || '').trim()) {
+        showWarningToast('未查询到 Team 账号列表，已从 token 自动填入 ChatGPT ID，可直接尝试保存导入')
+      } else {
+        showErrorToast('校验成功，但未返回可用账号（可能没有 Team 账号权限）')
+      }
       return
     }
 
-    showSuccessToast(`校验成功：获取到 ${checkedChatgptAccounts.value.length} 个账号`)
+    showSuccessToast(result?.tokenRefreshed
+      ? `Access Token 已自动刷新，校验成功：获取到 ${checkedChatgptAccounts.value.length} 个账号`
+      : `校验成功：获取到 ${checkedChatgptAccounts.value.length} 个账号`)
 
     // If user hasn't filled chatgptAccountId yet and there is only 1 option, autofill it.
     if (!String(formData.value.chatgptAccountId || '').trim() && checkedChatgptAccounts.value.length === 1) {
       formData.value.chatgptAccountId = checkedChatgptAccounts.value[0]?.accountId || ''
     }
 
     applyCheckedAccountSelection(formData.value.chatgptAccountId)
     await openChatgptIdDropdown()
   } catch (err: any) {
-    const message = err?.response?.data?.error || '校验失败'
+    const payload = err?.response?.data || {}
+    const message = payload?.error || '校验失败'
     logHttpErrorWithBody('[Accounts] 校验 token 失败', err)
-    checkAccessTokenError.value = message
-    showErrorToast(message)
+
+    const inferredEmail = String(payload?.inferredEmail || '').trim()
+    if (inferredEmail) {
+      formData.value.email = inferredEmail
+    }
+
+    const inferredChatgptAccountId = String(payload?.inferredChatgptAccountId || '').trim()
+    if (inferredChatgptAccountId && !String(formData.value.chatgptAccountId || '').trim()) {
+      formData.value.chatgptAccountId = inferredChatgptAccountId
+    }
+
+    const hint = (inferredEmail || inferredChatgptAccountId)
+      ? '（已从 token 解析并回填可用字段，可继续尝试保存）'
+      : ''
+    const refreshHint = payload?.tokenRefreshedAttempted ? '；已尝试 refresh token' : ''
+
+    checkAccessTokenError.value = `${message}${refreshHint}${hint}`
+    showErrorToast(`${message}${refreshHint}`)
   } finally {
     checkingAccessToken.value = false
   }
 }
 
 // 切换页码
 const goToPage = (page: number) => {
   if (page < 1 || page > totalPages.value || page === paginationMeta.value.page) return
   if (searchDebounceTimer) {
     clearTimeout(searchDebounceTimer)
     searchDebounceTimer = null
   }
   paginationMeta.value.page = page
   loadAccounts()
 }
 
 const loadAccounts = async () => {
   try {
     loading.value = true
     error.value = ''
     const params: GptAccountsListParams = {
       page: paginationMeta.value.page,
       pageSize: paginationMeta.value.pageSize,
     }
     // 添加搜索参数
