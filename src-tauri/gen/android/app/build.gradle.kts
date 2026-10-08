import java.util.Properties
import org.jetbrains.kotlin.gradle.dsl.JvmTarget

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("rust")
}

val tauriProperties = Properties().apply {
    val propFile = file("tauri.properties")
    if (propFile.exists()) {
        propFile.inputStream().use { load(it) }
    }
}

// release 签名口令与密钥路径：key.properties 与 keystore/ 都在 .gitignore 里，不进版本库。
// 文件缺席时不建 signingConfig —— release 仍能构建，只是产出未签名包。
val keystoreProperties = Properties().apply {
    val propFile = rootProject.file("key.properties")
    if (propFile.exists()) {
        propFile.inputStream().use { load(it) }
    }
}
val hasKeystore = keystoreProperties.getProperty("storeFile") != null

android {
    compileSdk = 37
    namespace = "best.prime998244353.unnamed"
    defaultConfig {
        manifestPlaceholders["usesCleartextTraffic"] = "false"
        applicationId = "best.prime998244353.unnamed"
        minSdk = 24
        // 停在 28 是有意的，不是漏改：Android 10 起（targetSdk >= 29）应用落到 untrusted_app 域，
        // 对 app_data_file 收掉了 execute，私有目录里的可执行文件会被 EACCES 挡掉。降到 28 后落到
        // untrusted_app_27 域，自备编译器才跑得起来 —— 这也是 Termux 长期停在 28 的原因。
        // 本项目的原生执行要起随包 clang 与其产物，全部落在 filesDir 下，因此这一项是承重的，
        // 改动前先看 HANDOFF 第 14 节 Android 部分。
        targetSdk = 28
        versionCode = tauriProperties.getProperty("tauri.android.versionCode", "1").toInt()
        versionName = tauriProperties.getProperty("tauri.android.versionName", "1.0")
    }
    signingConfigs {
        // storeFile 相对 android 工程根（src-tauri/gen/android），不是 app 模块目录
        if (hasKeystore) {
            create("release") {
                storeFile = rootProject.file(keystoreProperties.getProperty("storeFile"))
                storePassword = keystoreProperties.getProperty("storePassword")
                keyAlias = keystoreProperties.getProperty("keyAlias")
                keyPassword = keystoreProperties.getProperty("keyPassword")
            }
        }
    }
    buildTypes {
        getByName("debug") {
            applicationIdSuffix = ".debug"
            manifestPlaceholders["usesCleartextTraffic"] = "true"
            isDebuggable = true
            isJniDebuggable = true
            isMinifyEnabled = false
            packaging {
                jniLibs.keepDebugSymbols.add("*/arm64-v8a/*.so")
                jniLibs.keepDebugSymbols.add("*/armeabi-v7a/*.so")
                jniLibs.keepDebugSymbols.add("*/x86/*.so")
                jniLibs.keepDebugSymbols.add("*/x86_64/*.so")
            }
        }
        getByName("release") {
            if (hasKeystore) {
                signingConfig = signingConfigs.getByName("release")
            }
            optimization {
               enable = true
            }
            proguardFiles(
                *fileTree(".") {
                  include("**/*.pro")
                  exclude("build/**")
                }.files.toTypedArray()
            )
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_1_8
        targetCompatibility = JavaVersion.VERSION_1_8
    }
    buildFeatures {
        buildConfig = true
    }
    lint {
        // 只关这一条，不关整个 lintVital。targetSdk 停在 28 是有意的（见 defaultConfig 上方的注释：
        // >= 29 落到 untrusted_app 域，私有目录里的自备编译器就 execve 不了），而这条规则是面向
        // Google Play 上架的、且为 fatal 级 —— 不关掉，release 构建会直接失败。其余 lint 检查照旧跑。
        disable += "ExpiredTargetSdkVersion"
    }
}

kotlin {
    compilerOptions {
        jvmTarget = JvmTarget.JVM_1_8
    }
}

rust {
    rootDirRel = "../../../"
}

dependencies {
    implementation("androidx.webkit:webkit:1.14.0")
    implementation("androidx.appcompat:appcompat:1.7.1")
    implementation("androidx.activity:activity-ktx:1.10.1")
    implementation("com.google.android.material:material:1.12.0")
    implementation("androidx.lifecycle:lifecycle-process:2.10.0")
    testImplementation("junit:junit:4.13.2")
    androidTestImplementation("androidx.test.ext:junit:1.1.4")
    androidTestImplementation("androidx.test.espresso:espresso-core:3.5.0")
}

apply(from = file("tauri.build.gradle.kts"))
