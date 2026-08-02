import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";

interface TestUser {
  displayName: string;
  email: string;
}

function authHeaders(user: TestUser): Record<string, string> {
  return {
    "oai-authenticated-user-email": user.email,
    "oai-authenticated-user-full-name": encodeURIComponent(user.displayName),
    "oai-authenticated-user-full-name-encoding": "percent-encoded-utf-8",
  };
}

async function openUser(browser: Browser, user: TestUser): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({ extraHTTPHeaders: authHeaders(user) });
  await context.grantPermissions(["microphone"]);
  const page = await context.newPage();
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Create your first repository|You’ve been invited|Workspace unavailable/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Workspace unavailable" })).toHaveCount(0);
  return { context, page };
}

async function expectEditorsConverged(pageA: Page, pageB: Page, fragments: string[]): Promise<void> {
  const editorA = pageA.getByLabel("Collaborative code editor");
  const editorB = pageB.getByLabel("Collaborative code editor");
  await expect.poll(async () => {
    const [left, right] = await Promise.all([editorA.inputValue(), editorB.inputValue()]);
    return left === right && fragments.every((fragment) => left.includes(fragment));
  }, { timeout: 20_000, message: "both replicas should converge on the same source" }).toBe(true);
}

async function blockReplayDelivery(page: Page): Promise<void> {
  await page.route("**/api/rooms/**/events?*", async (route) => {
    if (route.request().method() === "GET") await route.abort("blockedbyclient");
    else await route.continue();
  });
}

async function expectRealtimeValue(page: Page, fragment: string): Promise<void> {
  const startedAt = Date.now();
  await expect(page.getByLabel("Collaborative code editor")).toHaveValue(new RegExp(fragment), { timeout: 500 });
  expect(Date.now() - startedAt, `WebSocket delivery of ${fragment} should take less than 500ms`).toBeLessThan(500);
}

async function expectReadableText(page: Page, selector: string, minimumPixels: number): Promise<void> {
  const fontSize = await page.locator(selector).first().evaluate((element) =>
    Number.parseFloat(window.getComputedStyle(element).fontSize),
  );
  expect(fontSize).toBeGreaterThanOrEqual(minimumPixels);
}

test("two users collaborate, review, merge, and enforce a viewer downgrade", async ({ browser }, testInfo) => {
  const suffix = `${Date.now().toString(36)}-${testInfo.workerIndex}`;
  const owner: TestUser = { displayName: "E2E Owner", email: `owner-${suffix}@meshforge.test` };
  const contributor: TestUser = { displayName: "E2E Contributor", email: `contributor-${suffix}@meshforge.test` };
  const repositoryName = `collaboration-${suffix}`;
  const branchName = `feature-${suffix}`;
  const ownerChange = `// owner edit ${suffix}`;
  const contributorChange = `// contributor edit ${suffix}`;
  const branchChange = `// reviewed branch ${suffix}`;
  const chatMessage = `Review room ${suffix} is synchronized`;
  const pullTitle = `Merge collaborative update ${suffix}`;

  const contributorSession = await openUser(browser, contributor);
  const ownerSession = await openUser(browser, owner);
  const { context: contributorContext, page: contributorPage } = contributorSession;
  const { context: ownerContext, page: ownerPage } = ownerSession;

  try {
    await test.step("owner creates a repository and invites a contributor", async () => {
      await ownerPage.getByLabel("Repository name").fill(repositoryName);
      await ownerPage.getByRole("button", { name: "Create repository" }).click();
      await expect(ownerPage.getByRole("button", { name: new RegExp(repositoryName) }).first()).toBeVisible();

      await ownerPage.getByLabel("Collapse explorer").click();
      await expect(ownerPage.locator(".workspace")).toHaveClass(/explorer-collapsed/);
      await expect(ownerPage.getByLabel("Expand explorer")).toBeVisible();
      await ownerPage.getByLabel("Expand explorer").click();
      await expect(ownerPage.locator(".workspace")).not.toHaveClass(/explorer-collapsed/);

      await ownerPage.getByLabel("Collapse live room").click();
      await expect(ownerPage.locator(".workspace")).toHaveClass(/room-collapsed/);
      await expect(ownerPage.getByLabel("Expand live room")).toBeVisible();
      await ownerPage.getByLabel("Expand live room").click();
      await expect(ownerPage.locator(".workspace")).not.toHaveClass(/room-collapsed/);

      await ownerPage.getByRole("button", { name: /Account menu/ }).click();
      await expect(ownerPage.locator("#account-menu")).toBeVisible();
      await expectReadableText(ownerPage, "#account-menu header strong", 14);
      await expectReadableText(ownerPage, "#account-menu a span", 11);
      await ownerPage.getByRole("button", { name: /Account menu/ }).click();

      await ownerPage.getByRole("button", { name: "Issues", exact: true }).click();
      await expectReadableText(ownerPage, ".issues-drawer > header strong", 17);
      await expectReadableText(ownerPage, ".issue-create input", 13);
      await ownerPage.getByLabel("Close issues").click();

      await ownerPage.getByRole("button", { name: "Pull requests", exact: true }).click();
      await expectReadableText(ownerPage, ".pull-drawer > header strong", 17);
      await expectReadableText(ownerPage, ".pull-form input", 13);
      await ownerPage.getByLabel("Close pull requests").click();

      await ownerPage.getByRole("button", { name: "Actions", exact: true }).click();
      await expectReadableText(ownerPage, ".actions-drawer > header strong", 17);
      await expectReadableText(ownerPage, ".workflow-sidebar button span", 13);
      await ownerPage.getByLabel("Close actions").click();

      await ownerPage.getByRole("button", { name: "Invite team" }).click();
      const accessDrawer = ownerPage.locator('aside[aria-label="Repository access"]');
      await expect(accessDrawer).toBeVisible();
      await accessDrawer.getByPlaceholder("teammate@example.com").fill(contributor.email);
      await accessDrawer.getByLabel("Role").selectOption("contributor");
      await accessDrawer.getByRole("button", { name: "Send invitation" }).click();
      await expect(accessDrawer.getByText(contributor.email)).toBeVisible();
    });

    await test.step("contributor accepts the invitation", async () => {
      await contributorPage.reload();
      await expect(contributorPage.getByRole("heading", { name: "You’ve been invited" })).toBeVisible();
      await contributorPage.locator(".empty-invitations").getByRole("button", { name: "Accept" }).click();
      await expect(contributorPage.getByLabel("Collaborative code editor")).toBeVisible();
      await expect(contributorPage.getByRole("button", { name: new RegExp(repositoryName) }).first()).toBeVisible();
    });

    await test.step("edits propagate in both directions and replicas converge", async () => {
      await ownerPage.getByLabel("Close repository access").click();
      await expect(ownerPage.locator(".sync-note")).toContainText("Live");
      await expect(contributorPage.locator(".sync-note")).toContainText("Live");

      const ownerEditor = ownerPage.getByLabel("Collaborative code editor");
      const contributorEditor = contributorPage.getByLabel("Collaborative code editor");
      await Promise.all([blockReplayDelivery(ownerPage), blockReplayDelivery(contributorPage)]);
      const initialSource = await ownerEditor.inputValue();
      await ownerEditor.fill(`${initialSource}\n${ownerChange}`);
      await expectRealtimeValue(contributorPage, ownerChange);
      await contributorEditor.fill(`${await contributorEditor.inputValue()}\n${contributorChange}`);
      await expectRealtimeValue(ownerPage, contributorChange);
      await expectEditorsConverged(ownerPage, contributorPage, [ownerChange, contributorChange]);
      await expect(contributorPage.getByLabel(/WebSocket deliveries/)).toHaveAttribute("aria-label", /^[1-9]\d* WebSocket deliveries/);
    });

    await test.step("chat is delivered to the other authenticated user", async () => {
      await ownerPage.getByLabel("Message the room").fill(chatMessage);
      await ownerPage.getByLabel("Send message").click();
      await expect(contributorPage.locator(".message p", { hasText: chatMessage })).toBeVisible({ timeout: 500 });
    });

    await test.step("contributor commits, creates a branch, and opens a pull request", async () => {
      await contributorPage.getByLabel("Commit message").fill("Save converged collaboration");
      await contributorPage.getByRole("button", { name: "Commit changes" }).click();
      await expect(contributorPage.getByText(/Committed [a-f0-9]{8} to main/)).toBeVisible();
      await expect(contributorPage.getByText("Working tree clean")).toBeVisible();

      await contributorPage.locator(".branch-pill").click();
      await contributorPage.getByLabel("New branch name").fill(branchName);
      await contributorPage.getByRole("button", { name: "New branch", exact: true }).click();
      await expect(contributorPage.locator(".branch-pill")).toContainText(branchName);

      const editor = contributorPage.getByLabel("Collaborative code editor");
      await editor.fill(`${await editor.inputValue()}\n${branchChange}`);
      await contributorPage.getByLabel("Commit message").fill("Add reviewed branch update");
      await contributorPage.getByRole("button", { name: "Commit changes" }).click();
      await expect(contributorPage.getByText(new RegExp(`Committed [a-f0-9]{8} to ${branchName}`))).toBeVisible();

      await contributorPage.getByRole("button", { name: "Pull requests", exact: true }).click();
      const pullDrawer = contributorPage.locator('aside[aria-label="Pull requests"]');
      await pullDrawer.getByPlaceholder("Describe the change").fill(pullTitle);
      await pullDrawer.getByPlaceholder("What changed, and why?").fill("Exercises the complete repository review workflow.");
      await pullDrawer.getByRole("button", { name: "Open pull request" }).click();
      const pullCard = pullDrawer.locator(".pull-card", { hasText: pullTitle });
      await expect(pullCard).toBeVisible();
      await expect(pullCard.getByRole("button", { name: "Merge pull request" })).toBeDisabled();
      await expect(pullCard).toContainText("Maintainer access is required to merge");
    });

    await test.step("owner merges and the repository survives a reconnect", async () => {
      await ownerPage.reload();
      await expect(ownerPage.getByLabel("Collaborative code editor")).toBeVisible();
      await ownerPage.getByRole("button", { name: "Pull requests", exact: true }).click();
      const pullCard = ownerPage.locator(".pull-card", { hasText: pullTitle });
      const mergeButton = pullCard.getByRole("button", { name: "Merge pull request" });
      await expect(mergeButton).toBeEnabled();
      await mergeButton.click();
      await expect(pullCard).toContainText("Merged");

      await ownerPage.reload();
      await expect(ownerPage.getByLabel("Collaborative code editor")).toHaveValue(new RegExp(branchChange));
      await ownerPage.getByRole("button", { name: "Pull requests", exact: true }).click();
      await expect(ownerPage.locator(".pull-card", { hasText: pullTitle })).toContainText("Merged");
    });

    await test.step("viewer downgrade revokes write, chat, merge, and audio controls", async () => {
      await ownerPage.getByLabel("Close pull requests").click();
      await ownerPage.getByRole("button", { name: "Invite team" }).click();
      const member = ownerPage.locator(".team-members article", { hasText: contributor.email });
      await member.locator("select").selectOption("viewer");
      await expect(member.locator("select")).toHaveValue("viewer");

      await contributorPage.reload();
      await expect(contributorPage.getByLabel("Collaborative code editor")).toHaveAttribute("readonly", "");
      await expect(contributorPage.getByLabel("Commit message")).toBeDisabled();
      await expect(contributorPage.getByLabel("Message the room")).toBeDisabled();
      await expect(contributorPage.getByRole("button", { name: "Audio restricted" })).toBeDisabled();
      await contributorPage.getByRole("button", { name: "Pull requests", exact: true }).click();
      await expect(contributorPage.locator(".pull-form").getByRole("button", { name: "Open pull request" })).toBeDisabled();
    });
  } finally {
    await Promise.allSettled([ownerContext.close(), contributorContext.close()]);
  }
});
