# OEIS: Step-by-step guide to add 4 Outlook accounts

This guide assumes all four Outlook accounts belong to the same Microsoft 365 organization/tenant.

The setup has two parts:

1. Configure Microsoft Entra ID and Microsoft Graph.
2. Add and connect the four mailboxes inside OEIS.

## Part 1: Prepare the four Outlook accounts

Write down the exact email addresses, for example:

```text
support1@company.com
support2@company.com
support3@company.com
support4@company.com
```

Make sure:

- All four mailboxes are active Microsoft 365 mailboxes.
- You have Microsoft 365 administrator access.
- The OEIS server can access Microsoft Graph over HTTPS.
- You know the Microsoft 365 Tenant ID.

Do not use the Outlook desktop application. OEIS connects through Microsoft Graph.

## Part 2: Create the Microsoft Entra application

1. Open the [Microsoft Entra admin center](https://entra.microsoft.com/).
2. Go to **Applications → App registrations**.
3. Select **New registration**.
4. Enter a name such as `OEIS Mailbox Monitor`.
5. Choose **Accounts in this organizational directory only**.
6. Leave the redirect URI empty for now.
7. Select **Register**.
8. Copy and securely save the **Application (client) ID** and **Directory (tenant) ID**.

## Part 3: Add Microsoft Graph permission

1. Open the new app registration.
2. Go to **API permissions**.
3. Select **Add a permission**.
4. Select **Microsoft Graph**.
5. Select **Application permissions**.
6. Search for and select `Mail.Read`.
7. Select **Add permissions**.
8. Click **Grant admin consent for your organization**.
9. Confirm the consent request.

The permission status should show `Granted for <your organization>`.

Use **Application permissions**, not Delegated permissions, for automatic background synchronization.

## Part 4: Create a client secret

1. In the app registration, open **Certificates & secrets**.
2. Select **New client secret**.
3. Add a description such as `OEIS Production`.
4. Choose an expiry period.
5. Select **Add**.
6. Immediately copy the **Value** of the secret.

Important: copy the secret **Value**, not the Secret ID. The value is shown only once.

Store these securely:

```env
AZURE_TENANT_ID=<Directory/Tenant ID>
AZURE_CLIENT_ID=<Application/Client ID>
AZURE_CLIENT_SECRET=<Secret Value>
```

Do not commit these values to Git or send them by email.

## Part 5: Restrict the app to the four mailboxes

Open Exchange Online PowerShell and run:

```powershell
Connect-ExchangeOnline

New-DistributionGroup `
  -Name "OEIS Allowed Mailboxes" `
  -Type Security

Add-DistributionGroupMember `
  -Identity "OEIS Allowed Mailboxes" `
  -Member support1@company.com

Add-DistributionGroupMember `
  -Identity "OEIS Allowed Mailboxes" `
  -Member support2@company.com

Add-DistributionGroupMember `
  -Identity "OEIS Allowed Mailboxes" `
  -Member support3@company.com

Add-DistributionGroupMember `
  -Identity "OEIS Allowed Mailboxes" `
  -Member support4@company.com
```

Create the application access policy, replacing the placeholder with the Application/Client ID:

```powershell
New-ApplicationAccessPolicy `
  -AppId "<AZURE_CLIENT_ID>" `
  -PolicyScopeGroupId "OEIS Allowed Mailboxes" `
  -AccessRight RestrictAccess `
  -Description "Restrict OEIS Graph access to approved mailboxes"
```

Test every mailbox:

```powershell
Test-ApplicationAccessPolicy -Identity support1@company.com -AppId "<AZURE_CLIENT_ID>"
Test-ApplicationAccessPolicy -Identity support2@company.com -AppId "<AZURE_CLIENT_ID>"
Test-ApplicationAccessPolicy -Identity support3@company.com -AppId "<AZURE_CLIENT_ID>"
Test-ApplicationAccessPolicy -Identity support4@company.com -AppId "<AZURE_CLIENT_ID>"
```

Each approved mailbox should return `AccessCheckResult : Granted`.

Also test an unrelated mailbox:

```powershell
Test-ApplicationAccessPolicy -Identity unrelated@company.com -AppId "<AZURE_CLIENT_ID>"
```

It should return `AccessCheckResult : Denied`. The policy can take some time to apply.

## Part 6: Configure the OEIS backend

On the OEIS server, configure the deployment environment with:

```env
AZURE_TENANT_ID=<your tenant ID>
AZURE_CLIENT_ID=<your application/client ID>
AZURE_CLIENT_SECRET=<your client secret value>
GRAPH_SCOPE=https://graph.microsoft.com/.default
```

Use the project’s secret manager or protected deployment environment. Do not put real credentials in source code.

Restart the OEIS backend after saving the values.

## Part 7: Check the Microsoft Graph connection

1. Open the OEIS web application.
2. Sign in using the Admin account.
3. Open **Mailboxes**.
4. Select **Add mailbox** or open the Microsoft Graph setup guidance.
5. Run the **Graph connection check**.
6. Confirm that the Graph configuration is ready.

If credentials are missing, verify the Tenant ID, Client ID, client secret **Value**, admin consent, and backend restart.

## Part 8: Add the first Outlook mailbox

1. Go to **Admin → Mailboxes**.
2. Select **Add mailbox**.
3. Select provider **Microsoft 365 / Outlook**.
4. Enter the exact mailbox address, for example `support1@company.com`.
5. Enter a display name such as `Support Mailbox 1`.
6. Select the correct timezone, such as `Asia/Kolkata`.
7. Keep the mailbox status as **Active**.
8. Select **Save**.
9. Select **Connect Outlook** for that mailbox.
10. Sign in using the exact mailbox account.
11. Accept the requested permissions if prompted.
12. Return to OEIS and select **Sync now**.

## Part 9: Add the remaining three mailboxes

Repeat the same process for each mailbox:

```text
support2@company.com — Support Mailbox 2
support3@company.com — Support Mailbox 3
support4@company.com — Support Mailbox 4
```

For each one, select **Save → Connect Outlook → sign in as that mailbox → Sync now**.

Always confirm that the Microsoft login is for the same mailbox being configured.

## Part 10: Verify all four mailboxes

In **Admin → Mailboxes**, confirm that all four rows show:

- Correct email address
- Provider: Microsoft 365
- Active status
- Connected status
- Recent synchronization time
- No sync error

Then select **Sync now**, wait for synchronization to finish, open the dashboard, filter by mailbox, and confirm that emails appear separately for each mailbox.

Expected result:

```text
Configured mailboxes: 4
Healthy mailboxes: 4
Mailbox errors: 0
```

## If a mailbox fails

Check these items:

1. The mailbox address is spelled exactly correctly.
2. The mailbox is in the configured Microsoft 365 tenant.
3. The mailbox was added to the `OEIS Allowed Mailboxes` group.
4. `Test-ApplicationAccessPolicy` returns `Granted`.
5. `Mail.Read` application permission has admin consent.
6. The Client ID belongs to the correct Entra app.
7. The client secret value is correct and not expired.
8. The backend was restarted after changing credentials.
9. The OEIS provider is set to Microsoft 365.
10. The mailbox is not paused in OEIS.

Do not delete and recreate mailboxes immediately. First check the displayed sync error and backend logs.

## Important security rules

- Never share the client secret publicly.
- Never commit `.env` files or secrets to Git.
- Do not send the secret by email or WhatsApp.
- Use HTTPS in production.
- Restrict the Graph app to only the four required mailboxes.
- Rotate the client secret before it expires.
- Use a certificate instead of a client secret for a stronger production setup.
- Keep the scheduler enabled on only one backend deployment.

After completing the setup, the four Outlook mailboxes will be monitored automatically by OEIS.
