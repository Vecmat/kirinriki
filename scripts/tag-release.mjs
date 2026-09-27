#!/usr/bin/env node
/**
 * 版本发布收尾：提交版本号变更 → 打 v 标签 → 推送，触发 GitHub Actions 自动发布到 JSR。
 *
 * 前置：先运行 `node scripts/bump-version.mjs`（或 npm run version:patch）递增版本号。
 * 发布本身由 GitHub Actions（.github/workflows/release.yml）在标签推送后自动完成，
 * 本地无需 jsr 登录态，也无需工作区干净。
 *
 * 用法：npm run release（= bump-version + 本脚本）
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { execSync } from "node:child_process";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
/** 执行命令，输出透传到终端 */
const run = (cmd) => execSync(cmd, { cwd: root, stdio: "inherit" });
/** 执行命令并返回裁剪后的标准输出 */
const out = (cmd) => execSync(cmd, { cwd: root, encoding: "utf8" }).trim();

function main() {
    const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
    const tag = `v${pkg.version}`;

    // 标签已存在说明该版本发布过（JSR 不允许重复版本号），直接中止
    const existingTags = out("git tag -l").split("\n");
    if (existingTags.includes(tag)) {
        console.error(
            `[tag-release] 标签 ${tag} 已存在，该版本无法重复发布。请先处理：删掉旧标签重打，或递增版本后再发布。`,
        );
        process.exit(1);
    }

    // 只提交版本号文件，不夹带工作区其他改动
    // 注意：提交信息不能包含 [skip ci] 等标记，否则标签推送会连带被 GitHub 跳过，发布工作流不会触发
    run(`git add deno.json package.json`);
    const staged = out("git diff --cached --name-only");
    if (staged) {
        run(`git commit -m "chore: release ${tag}"`);
    } else {
        console.log("[tag-release] 版本号无变更，跳过提交");
    }

    // 先打标签、推提交、再推标签；推送失败时标签不会触发发布
    run(`git tag ${tag}`);
    run(`git push`);
    run(`git push origin ${tag}`);

    // 从 remote 地址解析 GitHub 仓库路径，提示发布进度入口
    const remote = out("git config --get remote.origin.url");
    const slug = remote
        .replace(/^.*github\.com[:/]/, "")
        .replace(/\.git$/, "");
    console.log(`[tag-release] ${tag} 已推送，GitHub Actions 将自动发布到 JSR`);
    console.log(`[tag-release] 发布进度：https://github.com/${slug}/actions`);
}

main();
