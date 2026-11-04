// Installation guidance only: no downloads, process launches or environment changes.
// Sources are official project installation pages, reviewed 2026-11-04.
export const INSTALL_LANGUAGES = Object.freeze([
  { id: "java", label: "Java", extension: "java", languageId: "java" },
  { id: "kotlin", label: "Kotlin", extension: "kt", languageId: "kotlin" },
  { id: "typescript", label: "TypeScript", extension: "ts", languageId: "typescript" },
  { id: "javascript", label: "JavaScript", extension: "js", languageId: "typescript" },
  { id: "go", label: "Go", extension: "go", languageId: "go" },
  { id: "swift", label: "Swift", extension: "swift", languageId: "swift" },
  { id: "rust", label: "Rust", extension: "rs", languageId: "rust" },
].map(item => Object.freeze(item)));

const LINKS = Object.freeze({
  java: "https://learn.microsoft.com/en-us/java/openjdk/download",
  jdtls: "https://github.com/eclipse-jdtls/eclipse.jdt.ls#installation",
  jdtlsBrew: "https://formulae.brew.sh/formula/jdtls",
  kotlin: "https://github.com/Kotlin/kotlin-lsp#install-kotlin-lsp-cli",
  kotlinReleases: "https://github.com/Kotlin/kotlin-lsp/releases",
  node: "https://nodejs.org/en/download",
  typescript: "https://github.com/typescript-language-server/typescript-language-server/tree/v6.0.3#installing",
  go: "https://go.dev/doc/install",
  gopls: "https://go.dev/gopls/#installation",
  rust: "https://rust-lang.org/tools/install/",
  rustAnalyzer: "https://rust-analyzer.github.io/book/rust_analyzer_binary.html#rustup",
  rustSource: "https://rust-analyzer.github.io/book/installation.html#rust-standard-library",
});

function platformName(value) {
  if (value === "macos" || value === "darwin") return "macos";
  if (value === "windows" || value === "win32") return "windows";
  return value === "linux" ? "linux" : "other";
}

function locate(name, platform) {
  return platform === "windows" ? `Get-Command ${name}` : platform === "other" ? undefined : `command -v ${name}`;
}

function javaGuide(platform) {
  return {
    requirements: ["JDT LS 릴리스가 요구하는 JDK와 프로젝트용 JDK", "jdtls 실행 파일; 공식 Python 래퍼 사용 시 Python 3.9 이상"],
    steps: [
      { title: "JDK 설치", detail: "운영체제와 CPU에 맞는 JDK를 설치하세요. 서버 실행용 JDK와 프로젝트 대상 Java 버전은 다를 수 있습니다.", url: LINKS.java },
      { title: "SDK 버전 확인", detail: "Herdr가 사용할 환경에서 Java 런타임과 컴파일러 버전을 확인하세요.", command: "java -version\njavac -version" },
      platform === "macos"
        ? { title: "JDT LS 설치", detail: "Homebrew를 사용하는 경우 공식 formula로 설치할 수 있습니다. 필요한 실행용 JDK도 의존성으로 설치됩니다.", command: "brew install jdtls", url: LINKS.jdtlsBrew }
        : { title: "JDT LS 설치", detail: "공식 milestone을 내려받아 압축을 풀고 플랫폼별 실행 안내를 따르세요. Linux 패키지 이름은 배포판마다 다릅니다. 엔진이 jdtls 실행 파일을 찾을 수 있어야 합니다.", url: LINKS.jdtls },
      { title: "서버 경로 확인", detail: "jdtls가 감지되는지 확인한 뒤 Java 파일이 있는 프로젝트에서 LSP를 시작하세요.", command: locate("jdtls", platform), url: LINKS.jdtls },
    ],
    notes: ["JDT LS의 요구 Java 버전은 설치한 서버 릴리스에서 확인하세요.", "Windows ARM64 등 플랫폼 지원은 해당 JDT LS 릴리스의 배포 구성을 확인하세요."],
  };
}

function kotlinGuide(platform) {
  return {
    requirements: ["프로젝트가 요구하는 JDK와 Gradle 또는 Maven 환경", "JetBrains 공식 kotlin-lsp CLI"],
    steps: [
      { title: "프로젝트 JDK 설치", detail: "프로젝트의 JVM 대상 버전에 맞는 JDK를 설치하세요. 공식 standalone 서버는 자체 런타임을 포함한 플랫폼별 패키지를 제공합니다.", url: LINKS.java },
      { title: "SDK 버전 확인", detail: "프로젝트가 사용할 Java 버전을 확인하세요.", command: "java -version" },
      platform === "macos"
        ? { title: "Kotlin LSP 설치", detail: "Homebrew를 사용하는 경우 JetBrains 공식 tap에서 CLI를 설치하세요.", command: "brew install JetBrains/utils/kotlin-lsp", url: LINKS.kotlin }
        : { title: "Kotlin LSP 설치", detail: "운영체제와 CPU에 맞는 standalone 패키지를 선택해 압축을 푸세요. 공식 CLI 설치 안내에 따라 실행 경로를 PATH에 등록하세요.", url: LINKS.kotlinReleases },
      { title: "서버 경로 확인", detail: "kotlin-lsp가 감지되는지 확인한 뒤 Gradle 또는 Maven 프로젝트를 열어 LSP를 시작하세요.", command: locate("kotlin-lsp", platform), url: LINKS.kotlin },
    ],
    notes: ["IDE 확장만 설치한 경우 터미널에서 사용할 CLI가 따로 필요할 수 있습니다.", "프로젝트 의존성이나 Gradle/Maven 설정 오류는 서버 설치 후에도 해결해야 합니다."],
  };
}

function typescriptGuide(platform) {
  return {
    requirements: ["Node.js 22.22.2 이상과 npm; 지원되는 LTS 권장", "typescript-language-server 6과 classic TypeScript 6"],
    steps: [
      { title: "Node.js 설치", detail: "공식 다운로드에서 운영체제와 CPU에 맞는 Node.js LTS를 설치하세요. Linux는 배포판에 맞는 설치 안내를 사용하세요.", url: LINKS.node },
      { title: "SDK 버전 확인", detail: "Node.js와 npm이 모두 감지되는지 확인하세요.", command: "node --version\nnpm --version" },
      { title: "TypeScript 서버 설치", detail: "JavaScript도 같은 서버를 사용합니다. 검증된 classic tsserver 조합을 위해 TypeScript와 언어 서버의 major 버전을 6으로 맞춥니다.", command: "npm install --global typescript@6 typescript-language-server@6", url: LINKS.typescript },
      { title: "서버 확인", detail: "설치된 서버 버전을 확인하세요. npm의 전역 실행 경로가 Herdr 환경의 PATH에 있어야 합니다.", command: "typescript-language-server --version" },
    ],
    notes: ["TypeScript와 JavaScript는 typescript 서버 하나를 공유합니다.", "프로젝트의 tsconfig.json 또는 jsconfig.json과 의존성을 사용합니다.", "TypeScript 7의 native API는 classic tsserver와 다르므로 이 안내의 조합과 섞지 마세요."],
  };
}

function goGuide(platform) {
  return {
    requirements: ["지원되는 Go SDK", "gopls 실행 파일"],
    steps: [
      { title: "Go SDK 설치", detail: platform === "windows" ? "공식 Windows 설치 프로그램으로 Go를 설치하세요." : "공식 안내에서 운영체제와 CPU에 맞는 Go SDK를 설치하세요.", url: LINKS.go },
      { title: "SDK 버전 확인", detail: "Go 버전과 도구 설치 경로를 확인하세요.", command: "go version\ngo env GOBIN GOPATH" },
      { title: "gopls 설치", detail: "공식 Go 언어 서버를 설치하세요. 사용 중인 SDK가 최신 gopls의 요구 버전을 충족해야 합니다.", command: "go install golang.org/x/tools/gopls@latest", url: LINKS.gopls },
      { title: "서버 확인", detail: "GOBIN 또는 GOPATH의 bin 폴더를 Herdr가 사용할 PATH에 등록한 뒤 버전을 확인하세요.", command: "gopls version" },
    ],
    notes: ["go.mod 또는 go.work가 있는 프로젝트를 열어 LSP를 시작하세요."],
  };
}

function swiftGuide(platform) {
  const os = platform === "other" ? "" : platform === "macos" ? "macos/" : `${platform}/`;
  return {
    requirements: ["Swift 툴체인과 함께 제공되는 SourceKit-LSP", platform === "windows" ? "공식 안내의 MSVC 도구와 Windows SDK" : platform === "macos" ? "프로젝트에 필요한 Xcode 또는 Command Line Tools SDK" : "배포판별 Swift 시스템 의존성과 개발 도구"],
    steps: [
      { title: "Swift 툴체인 설치", detail: "공식 플랫폼 안내에 따라 설치하세요. SourceKit-LSP는 Swift 툴체인에 포함되므로 실행 파일 하나만 따로 복사하지 마세요.", url: `https://www.swift.org/install/${os}` },
      { title: "SDK 버전 확인", detail: "사용할 Swift 툴체인의 버전을 확인하세요.", command: "swift --version" },
      { title: "SourceKit-LSP 경로 확인", detail: platform === "macos" ? "선택된 Xcode 툴체인에서 서버를 찾거나 설치한 Swift 툴체인의 bin 경로를 PATH에 등록하세요." : "설치한 Swift 툴체인의 bin 경로에서 sourcekit-lsp가 감지되어야 합니다.", command: platform === "macos" ? "xcrun --find sourcekit-lsp" : locate("sourcekit-lsp", platform), url: "https://www.swift.org/documentation/articles/zero-to-swift-emacs.html" },
    ],
    notes: ["프로젝트에 맞는 툴체인과 플랫폼 SDK를 함께 사용하세요.", "Package.swift 또는 Xcode 프로젝트가 있는 폴더에서 LSP를 시작하세요."],
  };
}

function rustGuide(platform) {
  return {
    requirements: ["rustup으로 관리하는 Rust 툴체인", "rust-analyzer와 rust-src 구성 요소"],
    steps: [
      { title: "Rust SDK 설치", detail: platform === "windows" ? "공식 rustup 설치 프로그램과 안내된 MSVC 빌드 도구를 설치하세요." : "공식 rustup 설치 안내를 확인해 운영체제에 맞게 설치하세요.", url: LINKS.rust },
      { title: "SDK 버전 확인", detail: "프로젝트가 선택한 Rust 및 Cargo 버전을 확인하세요.", command: "rustc --version\ncargo --version\nrustup show active-toolchain" },
      { title: "분석기 설치", detail: "프로젝트에서 사용하는 툴체인에 분석기를 추가하세요.", command: "rustup component add rust-analyzer", url: LINKS.rustAnalyzer },
      { title: "표준 라이브러리 소스 설치", detail: "표준 라이브러리 탐색에 필요한 rust-src를 추가하세요.", command: "rustup component add rust-src", url: LINKS.rustSource },
      { title: "서버 확인", detail: "rustup의 실행 경로가 Herdr 환경의 PATH에 있어야 합니다.", command: "rust-analyzer --version" },
    ],
    notes: ["Cargo.toml이 있는 프로젝트를 열어 LSP를 시작하세요.", "툴체인 override가 있으면 해당 버전과 rust-src의 호환성을 확인하세요. 빌드 스크립트에는 플랫폼 C/C++ 도구가 추가로 필요할 수 있습니다."],
  };
}

export function installationGuide(id, platform) {
  const language = INSTALL_LANGUAGES.find(item => item.id === id);
  if (!language) return null;
  const os = platformName(platform);
  const make = { java: javaGuide, kotlin: kotlinGuide, typescript: typescriptGuide,
    javascript: typescriptGuide, go: goGuide, swift: swiftGuide, rust: rustGuide }[id];
  const guide = make(os);
  return { title: `${language.label} 설치 안내`, ...guide,
    notes: [...guide.notes, ...(os === "other" ? ["운영체제를 확인하고 공식 문서의 해당 플랫폼 안내를 따르세요."] : []),
      "설치 명령은 자동 실행되지 않습니다. 설치 후 프로젝트를 선택하고 설치 확인과 LSP 시작을 누르세요. 실행 파일이 감지되지 않으면 PATH를 확인하고, 환경을 변경했다면 Herdr를 다시 실행하세요."] };
}
