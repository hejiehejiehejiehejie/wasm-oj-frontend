buildscript {
    repositories {
        // 国内直连 dl.google.com 常 Read timed out（release 的 lintVital 要下 intellij-core /
        // kotlin-compiler 那两个 jar，就卡在这儿）。阿里云镜像放最前，原仓库保留作后备。
        maven { url = uri("https://maven.aliyun.com/repository/google") }
        maven { url = uri("https://maven.aliyun.com/repository/public") }
        google()
        mavenCentral()
    }
    dependencies {
        classpath("com.android.tools.build:gradle:9.3.1")
        classpath("org.jetbrains.kotlin:kotlin-gradle-plugin:2.2.10")
    }
}

allprojects {
    repositories {
        maven { url = uri("https://maven.aliyun.com/repository/google") }
        maven { url = uri("https://maven.aliyun.com/repository/public") }
        google()
        mavenCentral()
    }
}

tasks.register("clean").configure {
    delete("build")
}

