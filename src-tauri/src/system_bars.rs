//! 壳的**状态栏**跟着站内主题走：底色 + 图标明暗，两件事一起下发。
//!
//! **为什么需要**：`MainActivity.onCreate` 里那句 `enableEdgeToEdge()`（AndroidX Activity 的
//! 默认参数）把状态栏设成透明，并按**系统深色模式**定图标明暗 —— 它的 `detectDarkMode` 读的是
//! `Configuration.UI_MODE_NIGHT_YES`。可本应用的主题是站内自己的偏好（存在 WebView 的
//! `localStorage` 里，见 `src/services/editorSettings.js`），跟系统深色模式可以不一致：
//! 深色主题配浅色系统时，状态栏图标就是黑压在一整片黑上；浅色主题配深色系统则反过来。
//!
//! **为什么走这条命令**：主题真值在前端（一次 `getComputedStyle('--bg-chrome')`）。前端 →
//! `invoke` → 本文件 → JNI → `SystemBars.apply(...)` 是本工程既有的那条通路，与
//! `android_toolchain.rs` 同一个口径：**原生侧只收标量，不产出任何面向用户的话术**，
//! 错的原文回给前端。
//!
//! **只在 Android 上有实体**：别的目标上是空实现。这条命令**两个 handler 都注册**（与
//! `android_toolchain::prepare_toolchain` 同一形状）—— 一是前端只有一份调用口径，二是让这个
//! 文件在宿主机上也过一遍类型检查，不必等出安卓包才发现编译错；顺手也让「同一个模块只在
//! 一个 cfg 分支里被引用」那种 dead_code 告警不会冒出来。桌面端走不到它（前端有 `IS_ANDROID`
//! 闸门，见 `src/services/systemBars.js`）。
//!
//! ## 一处 JNI 上的坑（写这个文件时踩到的）
//!
//! 要调的 `SystemBars` 是**应用自己的类**，所以不能用 `JNIEnv::find_class`：从
//! `ndk_context` 里拿到的那条通路是 native 线程附到 JVM 上（`AttachCurrentThread`），
//! 这种线程上栈里没有 Java 帧，`FindClass` 会退回去用**系统 ClassLoader**，
//! 它不认识应用类，直接 `ClassNotFoundException`。这里改用
//! `ApplicationContext.getClassLoader().loadClass("...")` —— 那个 ClassLoader 就是应用的
//! PathClassLoader，任何线程上都能装到应用类。（`android_toolchain.rs` 没撞上这条，
//! 是因为它调的全是 `ApplicationContext` 自己的方法，一个类名都没查。）

/// 前端调用方式：`invoke('set_system_bars', { dark, color })`
///
/// - `dark`：应用当前是不是深色主题 —— 决定状态栏图标画成浅色还是深色
/// - `color`：状态栏底色，`#rrggbb` 或 `#rgb`（前端从 `--bg-chrome` 读出来）。
///   空串 = 只改图标明暗、不动底色（前端在 CSS 还没注进来时读到空值就用它顶着，
///   此时状态栏保持透明、由网页画自己那层底色，与今天的行为一致）
///
/// 不标 `async`：这条命令要动窗口，**跑在 Tauri 的主线程上正好**（Android 上就是 UI 线程，
/// 见 `android_toolchain.rs` 里那句「解压跑在主线程上会 ANR」的反面说明）；耗时是微秒级。
#[tauri::command]
pub fn set_system_bars(dark: bool, color: String) -> Result<(), String> {
    let argb = match color.trim() {
        "" => None,
        text => Some(parse_hex_color(text)?),
    };
    platform::apply(dark, argb)
}

/// `#rrggbb` / `#rgb` → 不透明的 ARGB（Java 那边要的是 `int`）。
///
/// 只认这两种写法：色值一律出自 `src/styles/base.css` 的 `--bg-chrome`，那里就是十六进制。
/// 认不出来时报错而不是猜一个 —— 静默用错色值等于把「状态栏不跟主题」这个 bug 又藏回去。
fn parse_hex_color(text: &str) -> Result<i32, String> {
    let body = text.trim();
    let body = body.strip_prefix('#').unwrap_or(body);
    let rgb = match body.len() {
        // `#abc` → `0xaabbcc`
        3 => {
            let mut out = 0u32;
            for ch in body.chars() {
                let digit = ch.to_digit(16).ok_or_else(|| not_hex(text))?;
                out = (out << 8) | (digit << 4) | digit;
            }
            out
        }
        6 => u32::from_str_radix(body, 16).map_err(|_| not_hex(text))?,
        _ => return Err(format!("色值要写成 #rgb 或 #rrggbb，收到的是 {text}")),
    };
    Ok((0xff00_0000 | rgb) as i32)
}

fn not_hex(text: &str) -> String {
    format!("色值不是十六进制：{text}")
}

#[cfg(target_os = "android")]
mod platform {
    use jni::objects::{JClass, JObject, JValue};
    use jni::JNIEnv;

    /// 桥接类 `SystemBars.kt` 的全限定名（点号写法，给 `ClassLoader.loadClass` 用）。
    /// **这是契约**：它等于 `gen/android/app/build.gradle.kts` 里的 `namespace` / `applicationId`，
    /// 改名要两边一起改（`MainActivity.kt` 所在的包就是它）。
    const BRIDGE_CLASS: &str = "best.prime998244353.unnamed.SystemBars";

    /// 桥接方法名与描述符。**同样是契约**：改 `SystemBars.apply` 的签名要一起改这里。
    /// `(ZI)V` = 收 `boolean` + `int`、返回 `void`。
    const BRIDGE_METHOD: &str = "apply";
    const BRIDGE_SIG: &str = "(ZI)V";

    /// `color` 为 `None`（前端给了空串）= 只改图标、底色**下发全透明** ——
    /// edge-to-edge 下这条栏本来就是透明的、由网页画自己那层底色，给 0 等于什么都没改。
    pub fn apply(dark: bool, color: Option<i32>) -> Result<(), String> {
        let ctx = ndk_context::android_context();
        // SAFETY: 这两个指针是 tao 在 Android 启动时经 ndk_context::initialize_android_context
        // 存进来的（vm 是 JavaVM*，context 是 ApplicationContext 的 global ref），进程内一直有效。
        // 与 android_toolchain.rs 的 with_java 同一份说明。
        let vm = unsafe { jni::JavaVM::from_raw(ctx.vm().cast()) }
            .map_err(|err| format!("拿不到 JavaVM：{err}"))?;
        let mut env = vm
            .attach_current_thread()
            .map_err(|err| format!("附加到 JVM 失败：{err}"))?;
        // SAFETY: 同上。这里只借用这个 global ref，不接管所有权
        let context = unsafe { JObject::from_raw(ctx.context().cast()) };

        let class = bridge_class(&mut env, &context)?;
        env.call_static_method(
            class,
            BRIDGE_METHOD,
            BRIDGE_SIG,
            &[
                JValue::Bool(dark as u8),
                JValue::Int(color.unwrap_or(0)),
            ],
        )
        .map_err(|err| format!("调用 {BRIDGE_CLASS}.{BRIDGE_METHOD} 失败：{err}"))?;
        Ok(())
    }

    /// 拿 `SystemBars` 的 `jclass`。走 ClassLoader 而不是 `find_class`，理由见文件头那节。
    fn bridge_class<'a>(env: &mut JNIEnv<'a>, context: &JObject<'a>) -> Result<JClass<'a>, String> {
        let loader = env
            .call_method(context, "getClassLoader", "()Ljava/lang/ClassLoader;", &[])
            .and_then(|value| value.l())
            .map_err(|err| format!("取应用的 ClassLoader 失败：{err}"))?;
        let name = env
            .new_string(BRIDGE_CLASS)
            .map_err(|err| format!("构造类名失败：{err}"))?;
        let class = env
            .call_method(
                &loader,
                "loadClass",
                "(Ljava/lang/String;)Ljava/lang/Class;",
                &[JValue::Object(name.as_ref())],
            )
            .and_then(|value| value.l())
            .map_err(|err| format!("装不到 {BRIDGE_CLASS}：{err}"))?;
        Ok(JClass::from(class))
    }
}

#[cfg(not(target_os = "android"))]
mod platform {
    /// 空实现。**回 `Ok` 而不是像 `android_toolchain` 那样回一句「Android 专有」**：
    /// 那边是「你要的东西这边根本没有」，这边是「要的效果这边本来就不用做」
    /// —— 桌面端没有可同步的系统栏，这条命令在那儿无事可做，不算失败。
    /// （桌面端照样注册了它，第一是为了让这条命令在前端只有一份调用口径，
    /// 第二是让 `system_bars.rs` 在宿主机上也过一遍类型检查，不必等到出安卓包才发现编译错。）
    pub fn apply(_dark: bool, _color: Option<i32>) -> Result<(), String> {
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::parse_hex_color;

    #[test]
    fn hex_color_accepts_both_forms() {
        // 深色 / 浅色两套主题里 --bg-chrome 的两支，各验一次；外加三位简写
        assert_eq!(parse_hex_color("#1c1c1c"), Ok(0xff1c1c1c_u32 as i32));
        assert_eq!(parse_hex_color("#e8e8e8"), Ok(0xffe8e8e8_u32 as i32));
        assert_eq!(parse_hex_color("#abc"), Ok(0xffaabbcc_u32 as i32));
        // 大小写、缺 #、带空白都该认
        assert_eq!(parse_hex_color(" 1C1C1C "), Ok(0xff1c1c1c_u32 as i32));
    }

    #[test]
    fn hex_color_rejects_junk() {
        assert!(parse_hex_color("").is_err());
        assert!(parse_hex_color("#12345").is_err());
        assert!(parse_hex_color("#gggggg").is_err());
        assert!(parse_hex_color("rgb(1,2,3)").is_err());
    }
}
