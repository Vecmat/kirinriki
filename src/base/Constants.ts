// 使用标准 atob 解码（Node 16+/Deno/Bun/Workers 通用），避免额外依赖
export const WELCOME = "\n  == https://github.com/vecmat == " + "\n     🌑 🌒 🌓 🌔 🌕 🌖 🌗 🌘 🌑    \n\n";
const LOGOSTR =
    "CiBfICAgIF8gICAgICBfICAgICAgICAgICAgXyBfICAgIF8gCnwgfCAgKF8pICAgIChfKSAgICAgICAgICAoXykgfCAgKF8pCnwgfCBfX18gXyBfXyBfIF8gX18gIF8gX18gX3wgfCBfX18gCnwgfC8gLyB8ICdfX3wgfCAnXyBcfCAnX198IHwgfC8gLyB8CnwgICA8fCB8IHwgIHwgfCB8IHwgfCB8ICB8IHwgICA8fCB8CnxffFxfXF98X3wgIHxffF98IHxffF98ICB8X3xffFxfXF98Cg==";

export const LOGO = atob(LOGOSTR);
