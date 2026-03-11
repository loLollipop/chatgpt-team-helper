diff --git a/frontend/src/services/api.ts b/frontend/src/services/api.ts
index 496117138fc4cf022a590ba0a81f947a0736aac2..5051af6ee67ecc39a24f04e8aa61477d72815cd0 100644
--- a/frontend/src/services/api.ts
+++ b/frontend/src/services/api.ts
@@ -362,50 +362,58 @@ export interface GptAccount {
 export interface CreateGptAccountDto {
   email: string
   token: string
   refreshToken?: string
   userCount?: number
   /** @deprecated 降级账号概念已移除；该字段仅保留用于兼容历史客户端（会被忽略）。 */
   isDemoted?: boolean
   isBanned?: boolean
   chatgptAccountId: string
   oaiDeviceId?: string
   expireAt?: string
 }
 
 export interface ChatgptAccountCheckInfo {
   accountId: string
   name: string
   planType: string | null
   expiresAt: string | null
   hasActiveSubscription: boolean
   /** @deprecated 降级账号概念已移除；该字段仅保留用于兼容历史客户端（恒为 false）。 */
   isDemoted: boolean
 }
 
 export interface CheckGptAccessTokenResponse {
   accounts: ChatgptAccountCheckInfo[]
+  tokenRefreshed?: boolean
+  tokenRefreshedAttempted?: boolean
+  inferredEmail?: string | null
+  inferredChatgptAccountId?: string | null
+  tokens?: {
+    accessToken: string
+    refreshToken?: string | null
+  }
 }
 
 export interface ChatgptAccountUser {
   id: string
   account_user_id?: string
   email?: string
   role?: string
   name?: string
   created_time?: string
   is_scim_managed?: boolean
 }
 
 export interface ChatgptAccountUsersResponse {
   items: ChatgptAccountUser[]
   total: number
   limit: number
   offset: number
 }
 
 export interface ChatgptAccountInviteItem {
   id: string
   email_address?: string
   role?: string
   created_time?: string
   is_scim_managed?: boolean
@@ -1643,52 +1651,52 @@ export interface GptAccountsListResponse {
 export const gptAccountService = {
   async getAll(params?: GptAccountsListParams): Promise<GptAccountsListResponse> {
     const response = await api.get('/gpt-accounts', { params })
     return response.data
   },
 
   async getById(id: number): Promise<GptAccount> {
     const response = await api.get(`/gpt-accounts/${id}`)
     return response.data
   },
 
   async create(data: CreateGptAccountDto): Promise<GptAccount> {
     const response = await api.post('/gpt-accounts', data)
     return response.data
   },
 
   async update(id: number, data: CreateGptAccountDto): Promise<GptAccount> {
     const response = await api.put(`/gpt-accounts/${id}`, data)
     return response.data
   },
 
   async delete(id: number): Promise<void> {
     await api.delete(`/gpt-accounts/${id}`)
   },
 
-  async checkAccessToken(token: string): Promise<CheckGptAccessTokenResponse> {
-    const response = await api.post('/gpt-accounts/check-token', { token })
+  async checkAccessToken(token: string, refreshToken?: string): Promise<CheckGptAccessTokenResponse> {
+    const response = await api.post('/gpt-accounts/check-token', { token, refreshToken })
     return response.data
   },
 
   async checkStatusRange(rangeDays: 7 | 15 | 30): Promise<CheckAccountStatusResponse> {
     const response = await api.post('/gpt-accounts/check-status', { rangeDays })
     return response.data
   },
 
   async syncUserCount(id: number): Promise<SyncUserCountResponse> {
     const response = await api.post(`/gpt-accounts/${id}/sync-user-count`)
     return response.data
   },
 
   async deleteAccountUser(accountId: number, userId: string): Promise<SyncUserCountResponse> {
     const response = await api.delete(`/gpt-accounts/${accountId}/users/${encodeURIComponent(userId)}`)
     return response.data
   },
 
   async inviteAccountUser(accountId: number, email: string): Promise<InviteUserResponse> {
     const response = await api.post(`/gpt-accounts/${accountId}/invite-user`, { email })
     return response.data
   },
 
   async deleteAccountInvite(accountId: number, emailAddress: string): Promise<DeleteInviteResponse> {
     const response = await api.delete(`/gpt-accounts/${accountId}/invites`, {
