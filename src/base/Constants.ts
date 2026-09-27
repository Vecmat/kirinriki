/** 启动时打印的欢迎语（含项目地址与月相装饰） */
export const WELCOME =
    "  == https://github.com/vecmat == " +
    "\n\n     🌑 🌒 🌓 🌔 🌕 🌖 🌗 🌘 🌑    \n\n";
const LOGOSTR =
    "CiBfICAgIF8gICAgICBfICAgICAgI" +
    "CAgICAgXyBfICAgIF8gCnwgfCAgKF" +
    "8pICAgIChfKSAgICAgICAgICAoXyk" +
    "gfCAgKF8pCnwgfCBfX18gXyBfXyBf" +
    "IF8gX18gIF8gX18gX3wgfCBfX18gC" +
    "nwgfC8gLyB8ICdfX3wgfCAnXyBcfC" +
    "AnX198IHwgfC8gLyB8CnwgICA8fCB" +
    "8IHwgIHwgfCB8IHwgfCB8ICB8IHwg" +
    "ICA8fCB8CnxffFxfXF98X3wgIHxff" +
    "F98IHxffF98ICB8X3xffFxfXF98Cg==";

/** 启动时打印的 ASCII LOGO（以 base64 存储，使用跨运行时通用的 atob 解码） */
export const LOGO: string = atob(LOGOSTR);
