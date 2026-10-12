package best.prime998244353.unnamed

import android.app.Activity
import androidx.core.view.WindowInsetsControllerCompat
import java.lang.ref.WeakReference

/**
 * 壳的**状态栏**跟着站内主题走 —— 底色与图标明暗两件事。
 *
 * 为什么需要这个文件：`MainActivity.onCreate` 里那句 `enableEdgeToEdge()`（AndroidX Activity 的
 * 默认参数）做两件事 —— 把状态栏设成**透明**、以及按**系统深色模式**定图标明暗
 * （`SystemBarStyle.auto` 的默认 `detectDarkMode` 读的就是 `Configuration.UI_MODE_NIGHT_YES`）。
 * 可本应用的主题是站内自己的偏好（存在 WebView 的 `localStorage` 里，见
 * `src/services/editorSettings.js`），跟系统深色模式可以不一致：深色主题配浅色系统时，
 * 状态栏图标就是黑压在一整片黑上；浅色主题配深色系统则反过来。
 *
 * 那条默认值只在 `onCreate` 里算一次、也没有装 insets 监听跟着变（见 activity 1.10.1 的
 * `EdgeToEdge.kt`：`impl.setUp(...)` 调完就完了），所以这里**直接覆盖**它就行，不会跟谁来回打架。
 *
 * 主题真值在网页里，通路是 前端 → Rust → JNI → 本文件（见 `src-tauri/src/system_bars.rs`）。
 */
object SystemBars {

  /**
   * 当前活着的 Activity。窗口只能从 Activity 上取 —— `ndk_context.android_context()` 给的是
   * ApplicationContext，没有 `getWindow()`。用弱引用挂着，别把 Activity 钉在静态字段上。
   */
  @Volatile
  private var activity: WeakReference<Activity>? = null

  /** `MainActivity.onCreate` 末尾调 */
  fun attach(target: Activity) {
    activity = WeakReference(target)
  }

  /** `MainActivity.onDestroy` 里调。只摘自己那一份 —— 新旧 Activity 交叠时别把新的顺手摘掉。 */
  fun detach(target: Activity) {
    if (activity?.get() === target) activity = null
  }

  /**
   * 由 Rust 侧经 JNI 调用，签名固定为 `(ZI)V`（改这个签名要同时改 `system_bars.rs` 里的
   * `BRIDGE_CLASS` / 方法名 / 描述符）。
   *
   * `@Suppress("DEPRECATION")` 是为下面那句 `statusBarColor` —— 它在 Android 15 起被标了
   * deprecated（那边只强制 `targetSdk >= 35` 的应用走纯 edge-to-edge，本工程停在 28，
   * 调用仍然生效。真要升 targetSdk 时这里会是一个静默失效点，HANDOFF 里记了一笔）。
   *
   * @param dark 应用当前是不是深色主题 —— 决定状态栏图标画成浅色还是深色
   * @param color 状态栏底色的 ARGB（前端从 `--bg-chrome` 读出来、Rust 解析成 int）。
   *   传 0 = 全透明：edge-to-edge 下这条栏本来就透明、由网页画自己那层底色，
   *   前端还没读到色值时就用它顶着，图标明暗照常同步。
   */
  @JvmStatic
  @Suppress("DEPRECATION")
  fun apply(dark: Boolean, color: Int) {
    val target = activity?.get() ?: return
    // Rust 那条命令没标 async，本来就落在主线程上（Android 上就是 UI 线程）——
    // 这一句是兜底：万一以后那条命令被改成 async，这里也不会在别的线程上动窗口。
    target.runOnUiThread {
      val window = target.window
      window.statusBarColor = color
      WindowInsetsControllerCompat(window, window.decorView).isAppearanceLightStatusBars = !dark
    }
  }
}
