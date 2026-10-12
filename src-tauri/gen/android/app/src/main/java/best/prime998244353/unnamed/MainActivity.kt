package best.prime998244353.unnamed

import android.os.Bundle
import androidx.activity.enableEdgeToEdge

class MainActivity : TauriActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
    // 把窗口交给 SystemBars：状态栏的底色与图标明暗要跟着**站内主题**走，而不是跟着
    // enableEdgeToEdge() 默认那套「系统深色模式」。主题真值在网页里，由前端经 Rust 送过来
    // （见 SystemBars.kt 与 src-tauri/src/system_bars.rs）。
    SystemBars.attach(this)
  }

  override fun onDestroy() {
    SystemBars.detach(this)
    super.onDestroy()
  }
}
