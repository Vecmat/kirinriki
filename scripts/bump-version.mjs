#!/usr/bin/env node
/**
 * 发布前自动递增 patch 版本号（x.y.Z → x.y.Z+1）。
 *
 * 递增基准优先取 JSR 上已发布的最新版本（避免本地版本落后导致发布被拒），
 * 网络不可用时回退到本地 deno.json 的版本。
 * 结果原子写入 deno.json（JSR 读取）与 package.json（npm 读取），保持两者一致。
 *
 * 用法：node scripts/bump-version.mjs
 * 输出：新的版本号（最后一行，便于 CI 捕获：$(node scripts/bump-version.mjs | tail -1)）
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const denoPath = join(root, "deno.json");
const pkgPath = join(root, "package.json");

/** 解析 "major.minor.patch" 为三元组，非法输入回退 0.0.0 */
function parseVersion(v) {
    const m = String(v).trim().match(/^(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/);
    return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : [0, 0, 0];
}

function formatVersion([major, minor, patch]) {
    return `${major}.${minor}.${patch}`;
}

/** 比较两个版本三元组：a > b 返回 1，相等返回 0，否则 -1 */
function compare(a, b) {
    for (let i = 0; i < 3; i++) {
        if (a[i] > b[i]) return 1;
        if (a[i] < b[i]) return -1;
    }
    return 0;
}

/** 查询 JSR 已发布的最新稳定版本；失败返回 null（回退本地版本） */
async function fetchLatestPublished(pkgName) {
    try {
        const res = await fetch(`https://jsr.io/${pkgName}/meta.json`);
        if (!res.ok) return null;
        const meta = await res.json();
        return typeof meta.latest === "string" ? meta.latest : null;
    } catch {
        return null;
    }
}

/** 保留 4 空格缩进与末尾换行（与仓库现有文件风格一致） */
function writeJson(path, obj) {
    writeFileSync(path, JSON.stringify(obj, null, 4) + "\n", "utf8");
}

async function main() {
    const deno = JSON.parse(readFileSync(denoPath, "utf8"));
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));

    if (!deno.name) {
        throw new Error("deno.json 缺少 name 字段，无法查询 JSR 版本");
    }

    const localVersion = parseVersion(deno.version || pkg.version || "0.0.0");
    const remoteRaw = await fetchLatestPublished(deno.name);
    const remoteVersion = remoteRaw ? parseVersion(remoteRaw) : null;

    // 以「本地版本」和「JSR 最新版本」中较大者为基准递增，保证新版本号一定未发布过
    const base = remoteVersion && compare(remoteVersion, localVersion) > 0 ? remoteVersion : localVersion;
    const next = [base[0], base[1], base[2] + 1];
    const nextVersion = formatVersion(next);

    deno.version = nextVersion;
    pkg.version = nextVersion;
    writeJson(denoPath, deno);
    writeJson(pkgPath, pkg);

    console.log(
        `[bump-version] ${remoteRaw ? `JSR latest ${remoteRaw}, ` : ""}local ${formatVersion(localVersion)} → ${nextVersion}`,
    );
    // 最后一行单独输出纯版本号，供 CI 脚本捕获
    console.log(nextVersion);
}

main().catch((err) => {
    console.error(err.message);
    process.exit(1);
});
