// The interface language, shared with the codenav mod: shared "codenav.lang",
// "en" (default) or "ko". T(text) gives the Korean text when it's chosen.
import { shared } from "herdr";

const KO = {
  "No folder": "폴더 없음", "Search (Enter)": "검색 (Enter)",
  "Focus a terminal to search its folder": "검색할 프로젝트의 터미널을 선택하세요",
  "{n} results in {files} files": "파일 {files}개에서 결과 {n}개", "No results found": "검색 결과가 없습니다",
  "Searching…": "찾는 중…", "Match case": "대소문자 구분", "Whole word": "단어 단위", "Regular expression": "정규식",
  "Open a file from Project or Search.": "프로젝트 또는 검색에서 파일을 여세요.",
  "Spaces": "스페이스", "Agents": "에이전트", "Explorer": "탐색기", "Search": "검색", "Source Control": "소스 제어", "Review": "리뷰",
  "Add Machine…": "머신 추가…", "Project": "프로젝트", "Add machine": "머신 추가", "Settings": "설정", "Cancel": "취소", "Clear results": "결과 지우기", "Close editor": "편집기 닫기",
  "Collapse folders": "폴더 모두 접기", "Dismiss": "닫기", "Hide Panel (Ctrl+`)": "패널 숨기기 (Ctrl+`)",
  "New File…": "새 파일…", "New Folder…": "새 폴더…", "New Space": "새 스페이스", "Show spaces": "스페이스 펼치기", "New Terminal or Agent": "새 터미널 또는 에이전트",
  "Open as text anyway": "텍스트로 열기", "Open file": "파일 열기",
  "Open with the system's app": "기본 앱으로 열기", "Refresh": "새로고침", "Reload sessions": "세션 다시 불러오기",
  "Save (Ctrl+S)": "저장 (Ctrl+S)", "Split Terminal": "터미널 분할", "Stage all": "모두 스테이징", "Unstage all": "모두 스테이징 취소",
  "Zoom in": "확대", "Zoom out": "축소", "Discard?": "변경을 버릴까요?", "Discard": "버리기", "Open": "열기", "Save": "저장",
  "Limited to 500 entries per folder, 5,000 total": "폴더당 500개, 전체 5,000개까지만 표시합니다",
  "Loading…": "불러오는 중…", "No folders inside": "하위 폴더가 없습니다",
  "No spaces yet: Open Folder… starts one": "스페이스가 없습니다: 폴더 열기…로 시작하세요",
  "Open a file from the Explorer, Search or Source Control view.": "탐색기, 검색, 소스 제어에서 파일을 여세요.",
  "Open it with the system's app to play it (it's downloaded first).": "재생하려면 기본 앱으로 여세요 (먼저 내려받습니다).",
  "Showing the first 1,000 changes": "처음 1,000개 변경만 표시합니다", "TERMINAL": "터미널",
  "Command Palette": "명령 팔레트", "Open folder in VS Code (Ctrl+Shift+G)": "VS Code에서 폴더 열기 (Ctrl+Shift+G)",
  "Unsaved changes": "저장하지 않은 변경", "Not a git repository": "git 저장소가 아닙니다",
  "Toggle Primary Side Bar (Ctrl+Shift+B)": "사이드바 토글 (Ctrl+Shift+B)", "Toggle Editor Area": "편집기 영역 토글",
  "Toggle Terminal Panel (Ctrl+`)": "터미널 패널 토글 (Ctrl+`)",
  "Editor beside the terminal": "편집기와 터미널을 좌우로", "Editor above the terminal": "편집기와 터미널을 위아래로",
  "Restore Editor Area": "편집기 영역 복원", "Maximize Panel": "패널 최대화", "Close tab": "탭 닫기",
  "Git Graph": "Git 그래프", "Commit": "커밋", "Fetch all remotes": "모든 원격 가져오기", "Copy hash": "해시 복사", "Close": "닫기", "{n} files changed": "파일 {n}개 변경", "detached": "분리된 HEAD", "{n} changed": "변경 {n}개", "{n} stashes": "스태시 {n}개", "Working…": "작업 중…", "Checking out…": "체크아웃 중…", "Applying…": "적용 중…", "Fetching…": "가져오는 중…", "No commits yet": "커밋이 없습니다", "Showing the latest {n} commits": "최근 커밋 {n}개만 표시합니다", "Focus a terminal inside a git repository": "git 저장소 안의 터미널을 선택하세요", "Checkout this commit (detached)": "이 커밋 체크아웃 (분리된 HEAD)", "Create Branch Here…": "여기서 브랜치 만들기…", "Create Tag Here…": "여기에 태그 만들기…", "Copy Commit Hash": "커밋 해시 복사", "Copy Subject": "커밋 제목 복사", "Create Branch": "브랜치 만들기", "Create Tag": "태그 만들기", "Drop Stash": "스태시 삭제", "Checkout with Changes": "변경이 있는 상태로 체크아웃", "Drop {s}? This can't be undone.": "{s}을(를) 삭제할까요? 되돌릴 수 없습니다.", "{n} tracked files have uncommitted changes. Checkout anyway? Git refuses if they would be overwritten.": "추적 중인 파일 {n}개에 커밋하지 않은 변경이 있습니다. 그래도 체크아웃할까요? 덮어쓰게 되면 git이 거부합니다.", "at {h} · {s}": "{h} · {s} 위치", "Create": "만들기", "Create & Checkout": "만들고 체크아웃", "Drop": "삭제", "Checkout": "체크아웃", "Not a valid name": "올바른 이름이 아닙니다", "Stashes": "스태시",
};

export const T = (text) => shared("codenav.lang") === "ko" ? KO[text] ?? text : text;
