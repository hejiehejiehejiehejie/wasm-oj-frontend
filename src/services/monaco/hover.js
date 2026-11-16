/**
 * C / C++ 的悬停：标准库静态签名 + 用户自定义函数（tree-sitter 语法级）。
 *
 * 【标准库为什么是静态表】Monaco 给 C / C++ 的只有分词器，没有语义分析（见 completion.js 文件头）。
 * 真正的「类型 + 签名 + 文档」要靠 clangd / libclang 之类的语言服务，本仓还没接。
 * 这里先用一张手写的「常用标准库」签名表顶上：悬停时按光标处的标识符查一次，
 * 命中就给签名，查不到就不弹。
 *
 * 【用户自定义函数走 tree-sitter】用户自己的函数在源码里写着签名，语法树能直接切出来，
 * 不需要推导（见 cppHover.js）。这部分**排在静态表之后**：静态表命中就不加载语法引擎，
 * 避免为了悬停 `sort` 去下 4.4MB 的 cpp 语法。代价是同名的用户函数（如自己写的 `max`）
 * 会被标准库签名遮住 —— 语义分析接进来之前，这个取舍保持「常用路径零成本」。
 *
 * 【两个开关在设置 › 编辑器里】「函数悬停提示」是总开关，关掉后这里一条都不弹；
 * 「语义分析（实验）」打开时才动态 import semanticHover.js。工具链的下载**不**在打开页面时
 * 发生（也不再在页面加载时预热），而是第一次真正需要语义结论时（或在设置里手动拨开开关时）——
 * 没用到的人连 26MB 都不会请求。
 *
 * 【只给签名和源码注释，不写标签行】「函数 / 参数 / 返回 / 定义于」这类标签行信息密度低、
 * 又要把文案拆成中英两套；悬停里真正有用的是签名本身和用户自己的注释（clangd 也是这么排的）。
 *
 * 【悬停是鼠标专属】触屏上不会触发；本模块不负责触屏的长按/点按提示。
 */
import * as monaco from './editorBundle.js'
import { watch } from 'vue'
import { editorSettings } from '../editorSettings.js'
import { findCppFunction } from './cppHover.js'

/** 标识符 → 签名（代码）。覆盖算法竞赛常见的自由函数、GCC builtins、类型与常量 */
const CPP_SIGNATURES = {
  // 容器与类型
  string: 'typedef std::basic_string<char> std::string;',
  string_view: 'typedef std::basic_string_view<char> std::string_view;',
  vector: 'template<class T, class Allocator = std::allocator<T> > class std::vector;',
  array: 'template<class T, std::size_t N> class std::array;',
  deque: 'template<class T, class Allocator = std::allocator<T> > class std::deque;',
  list: 'template<class T, class Allocator = std::allocator<T> > class std::list;',
  queue: 'template<class T, class Container = std::deque<T> > class std::queue;',
  priority_queue:
    'template<class T, class Container = std::vector<T>, class Compare = std::less<typename Container::value_type> > class std::priority_queue;',
  stack: 'template<class T, class Container = std::deque<T> > class std::stack;',
  map: 'template<class Key, class T, class Compare = std::less<Key> > class std::map;',
  multimap: 'template<class Key, class T, class Compare = std::less<Key> > class std::multimap;',
  unordered_map:
    'template<class Key, class T, class Hash = std::hash<Key> > class std::unordered_map;',
  unordered_multimap:
    'template<class Key, class T, class Hash = std::hash<Key> > class std::unordered_multimap;',
  set: 'template<class Key, class Compare = std::less<Key> > class std::set;',
  multiset: 'template<class Key, class Compare = std::less<Key> > class std::multiset;',
  unordered_set: 'template<class Key, class Hash = std::hash<Key> > class std::unordered_set;',
  unordered_multiset:
    'template<class Key, class Hash = std::hash<Key> > class std::unordered_multiset;',
  bitset: 'template<std::size_t N> class std::bitset;',
  pair: 'template<class T1, class T2> struct std::pair;',
  tuple: 'template<class... Types> class std::tuple;',
  complex: 'template<class T> class std::complex;',
  less: 'template<class T = void> struct std::less;',
  greater: 'template<class T = void> struct std::greater;',
  numeric_limits: 'template<class T> class std::numeric_limits;',
  hash: 'template<class Key> struct std::hash;',
  // 算法
  sort: 'template<class RandomIt> void std::sort(RandomIt first, RandomIt last);',
  stable_sort: 'template<class RandomIt> void std::stable_sort(RandomIt first, RandomIt last);',
  partial_sort:
    'template<class RandomIt> void std::partial_sort(RandomIt first, RandomIt middle, RandomIt last);',
  nth_element:
    'template<class RandomIt> void std::nth_element(RandomIt first, RandomIt nth, RandomIt last);',
  reverse: 'template<class BidirIt> void std::reverse(BidirIt first, BidirIt last);',
  rotate:
    'template<class ForwardIt> ForwardIt std::rotate(ForwardIt first, ForwardIt middle, ForwardIt last);',
  unique: 'template<class ForwardIt> ForwardIt std::unique(ForwardIt first, ForwardIt last);',
  lower_bound:
    'template<class ForwardIt, class T> ForwardIt std::lower_bound(ForwardIt first, ForwardIt last, const T& value);',
  upper_bound:
    'template<class ForwardIt, class T> ForwardIt std::upper_bound(ForwardIt first, ForwardIt last, const T& value);',
  equal_range:
    'template<class ForwardIt, class T> std::pair<ForwardIt, ForwardIt> std::equal_range(ForwardIt first, ForwardIt last, const T& value);',
  binary_search:
    'template<class ForwardIt, class T> bool std::binary_search(ForwardIt first, ForwardIt last, const T& value);',
  next_permutation:
    'template<class BidirIt> bool std::next_permutation(BidirIt first, BidirIt last);',
  prev_permutation:
    'template<class BidirIt> bool std::prev_permutation(BidirIt first, BidirIt last);',
  max: 'template<class T> const T& std::max(const T& a, const T& b);',
  min: 'template<class T> const T& std::min(const T& a, const T& b);',
  clamp: 'template<class T> const T& std::clamp(const T& v, const T& lo, const T& hi);',
  max_element:
    'template<class ForwardIt> ForwardIt std::max_element(ForwardIt first, ForwardIt last);',
  min_element:
    'template<class ForwardIt> ForwardIt std::min_element(ForwardIt first, ForwardIt last);',
  swap: 'template<class T> void std::swap(T& a, T& b) noexcept;',
  find: 'template<class InputIt, class T> InputIt std::find(InputIt first, InputIt last, const T& value);',
  find_if:
    'template<class InputIt, class UnaryPred> InputIt std::find_if(InputIt first, InputIt last, UnaryPred p);',
  count:
    'template<class InputIt, class T> std::ptrdiff_t std::count(InputIt first, InputIt last, const T& value);',
  count_if:
    'template<class InputIt, class UnaryPred> std::ptrdiff_t std::count_if(InputIt first, InputIt last, UnaryPred p);',
  any_of:
    'template<class InputIt, class UnaryPred> bool std::any_of(InputIt first, InputIt last, UnaryPred p);',
  all_of:
    'template<class InputIt, class UnaryPred> bool std::all_of(InputIt first, InputIt last, UnaryPred p);',
  none_of:
    'template<class InputIt, class UnaryPred> bool std::none_of(InputIt first, InputIt last, UnaryPred p);',
  for_each:
    'template<class InputIt, class UnaryFunction> UnaryFunction std::for_each(InputIt first, InputIt last, UnaryFunction f);',
  transform:
    'template<class InputIt, class OutputIt, class UnaryOperation> OutputIt std::transform(InputIt first, InputIt last, OutputIt d_first, UnaryOperation op);',
  copy: 'template<class InputIt, class OutputIt> OutputIt std::copy(InputIt first, InputIt last, OutputIt d_first);',
  copy_if:
    'template<class InputIt, class OutputIt, class UnaryPred> OutputIt std::copy_if(InputIt first, InputIt last, OutputIt d_first, UnaryPred pred);',
  fill: 'template<class ForwardIt, class T> void std::fill(ForwardIt first, ForwardIt last, const T& value);',
  fill_n:
    'template<class OutputIt, class Size, class T> OutputIt std::fill_n(OutputIt first, Size count, const T& value);',
  generate:
    'template<class ForwardIt, class Generator> void std::generate(ForwardIt first, ForwardIt last, Generator g);',
  replace:
    'template<class ForwardIt, class T> void std::replace(ForwardIt first, ForwardIt last, const T& old_value, const T& new_value);',
  remove:
    'template<class ForwardIt, class T> ForwardIt std::remove(ForwardIt first, ForwardIt last, const T& value);',
  remove_if:
    'template<class ForwardIt, class UnaryPred> ForwardIt std::remove_if(ForwardIt first, ForwardIt last, UnaryPred p);',
  merge:
    'template<class InputIt1, class InputIt2, class OutputIt> OutputIt std::merge(InputIt1 first1, InputIt1 last1, InputIt2 first2, InputIt2 last2, OutputIt d_first);',
  inplace_merge:
    'template<class BidirIt> void std::inplace_merge(BidirIt first, BidirIt middle, BidirIt last);',
  includes:
    'template<class InputIt1, class InputIt2> bool std::includes(InputIt1 first1, InputIt1 last1, InputIt2 first2, InputIt2 last2);',
  set_union:
    'template<class InputIt1, class InputIt2, class OutputIt> OutputIt std::set_union(InputIt1 first1, InputIt1 last1, InputIt2 first2, InputIt2 last2, OutputIt d_first);',
  set_intersection:
    'template<class InputIt1, class InputIt2, class OutputIt> OutputIt std::set_intersection(InputIt1 first1, InputIt1 last1, InputIt2 first2, InputIt2 last2, OutputIt d_first);',
  set_difference:
    'template<class InputIt1, class InputIt2, class OutputIt> OutputIt std::set_difference(InputIt1 first1, InputIt1 last1, InputIt2 first2, InputIt2 last2, OutputIt d_first);',
  partition:
    'template<class ForwardIt, class UnaryPred> ForwardIt std::partition(ForwardIt first, ForwardIt last, UnaryPred p);',
  stable_partition:
    'template<class ForwardIt, class UnaryPred> ForwardIt std::stable_partition(ForwardIt first, ForwardIt last, UnaryPred p);',
  shuffle:
    'template<class RandomIt, class URBG> void std::shuffle(RandomIt first, RandomIt last, URBG&& g);',
  lexicographical_compare:
    'template<class InputIt1, class InputIt2> bool std::lexicographical_compare(InputIt1 first1, InputIt1 last1, InputIt2 first2, InputIt2 last2);',
  back_inserter:
    'template<class Container> std::back_insert_iterator<Container> std::back_inserter(Container& c);',
  make_pair: 'template<class T1, class T2> std::pair<T1, T2> std::make_pair(T1 x, T2 y);',
  make_tuple: 'template<class... Types> std::tuple<Types...> std::make_tuple(Types&&... args);',
  tie: 'template<class... Types> std::tuple<Types&...> std::tie(Types&... args);',
  move: 'template<class T> typename std::remove_reference<T>::type&& std::move(T&& t) noexcept;',
  distance:
    'template<class InputIt> std::ptrdiff_t std::distance(InputIt first, InputIt last);',
  advance: 'template<class InputIt, class Distance> void std::advance(InputIt& it, Distance n);',
  next: 'template<class ForwardIt> ForwardIt std::next(ForwardIt it, std::ptrdiff_t n = 1);',
  prev: 'template<class BidirIt> BidirIt std::prev(BidirIt it, std::ptrdiff_t n = 1);',
  erase: 'template<class T, class A> void std::erase(std::vector<T, A>& c, const T& value);',
  // 数值
  iota: 'template<class ForwardIt, class T> void std::iota(ForwardIt first, ForwardIt last, T value);',
  accumulate:
    'template<class InputIt, class T> T std::accumulate(InputIt first, InputIt last, T init);',
  reduce: 'template<class InputIt, class T> T std::reduce(InputIt first, InputIt last, T init);',
  partial_sum:
    'template<class InputIt, class OutputIt> OutputIt std::partial_sum(InputIt first, InputIt last, OutputIt d_first);',
  gcd: 'template<class M, class N> std::common_type_t<M, N> std::gcd(M m, N n);',
  lcm: 'template<class M, class N> std::common_type_t<M, N> std::lcm(M m, N n);',
  __gcd: 'int __gnu_cxx::__gcd(int a, int b);',
  // 数学
  abs: 'int std::abs(int x);',
  fabs: 'double fabs(double x);',
  sqrt: 'double sqrt(double x);',
  cbrt: 'double cbrt(double x);',
  pow: 'double pow(double base, double exp);',
  exp: 'double exp(double x);',
  log: 'double log(double x);',
  log2: 'double log2(double x);',
  log10: 'double log10(double x);',
  floor: 'double floor(double x);',
  ceil: 'double ceil(double x);',
  round: 'double round(double x);',
  trunc: 'double trunc(double x);',
  fmod: 'double fmod(double x, double y);',
  sin: 'double sin(double x);',
  cos: 'double cos(double x);',
  tan: 'double tan(double x);',
  asin: 'double asin(double x);',
  acos: 'double acos(double x);',
  atan: 'double atan(double x);',
  atan2: 'double atan2(double y, double x);',
  hypot: 'double hypot(double x, double y);',
  fmax: 'double fmax(double x, double y);',
  fmin: 'double fmin(double x, double y);',
  sinh: 'double sinh(double x);',
  cosh: 'double cosh(double x);',
  tanh: 'double tanh(double x);',
  asinh: 'double asinh(double x);',
  acosh: 'double acosh(double x);',
  atanh: 'double atanh(double x);',
  modf: 'double modf(double x, double* iptr);',
  // GCC 位运算
  __builtin_popcount: 'int __builtin_popcount(unsigned int x);',
  __builtin_popcountll: 'int __builtin_popcountll(unsigned long long x);',
  __builtin_clz: 'int __builtin_clz(unsigned int x);',
  __builtin_clzll: 'int __builtin_clzll(unsigned long long x);',
  __builtin_ctz: 'int __builtin_ctz(unsigned int x);',
  __builtin_ctzll: 'int __builtin_ctzll(unsigned long long x);',
  __builtin_parity: 'int __builtin_parity(unsigned int x);',
  __builtin_parityll: 'int __builtin_parityll(unsigned long long x);',
  __builtin_ffs: 'int __builtin_ffs(int x);',
  __builtin_ffsll: 'int __builtin_ffsll(long long x);',
  __lg: 'template<class T> constexpr int std::__lg(T n);',
  __builtin_bswap32: 'uint32_t __builtin_bswap32(uint32_t x);',
  __builtin_bswap64: 'uint64_t __builtin_bswap64(uint64_t x);',
  // 随机
  mt19937: 'typedef std::mersenne_twister_engine<uint32_t, 32, 624, ...> std::mt19937;',
  mt19937_64:
    'typedef std::mersenne_twister_engine<uint64_t, 64, 312, ...> std::mt19937_64;',
  random_device: 'class std::random_device;',
  uniform_int_distribution:
    'template<class IntType = int> class std::uniform_int_distribution;',
  uniform_real_distribution:
    'template<class RealType = double> class std::uniform_real_distribution;',
  rand: 'int rand(void);',
  srand: 'void srand(unsigned int seed);',
  RAND_MAX: '#define RAND_MAX /* implementation-defined */  // <cstdlib>',
  // 字符串与转换
  to_string: 'std::string std::to_string(int value);',
  stoi: 'int std::stoi(const std::string& str);',
  stol: 'long std::stol(const std::string& str);',
  stoll: 'long long std::stoll(const std::string& str);',
  stoul: 'unsigned long std::stoul(const std::string& str);',
  stoull: 'unsigned long long std::stoull(const std::string& str);',
  stof: 'float std::stof(const std::string& str);',
  stod: 'double std::stod(const std::string& str);',
  atoi: 'int atoi(const char* str);',
  atof: 'double atof(const char* str);',
  toupper: 'int toupper(int ch);',
  tolower: 'int tolower(int ch);',
  isdigit: 'int isdigit(int ch);',
  isalpha: 'int isalpha(int ch);',
  strlen: 'std::size_t strlen(const char* str);',
  strcmp: 'int strcmp(const char* lhs, const char* rhs);',
  strcpy: 'char* strcpy(char* dest, const char* src);',
  strncpy: 'char* strncpy(char* dest, const char* src, std::size_t count);',
  sprintf: 'int sprintf(char* buffer, const char* format, ...);',
  sscanf: 'int sscanf(const char* buffer, const char* format, ...);',
  npos: 'static const std::size_t std::string::npos = -1;',
  // 流与 IO
  cin: 'extern std::istream std::cin;',
  cout: 'extern std::ostream std::cout;',
  cerr: 'extern std::ostream std::cerr;',
  endl: 'std::ostream& std::endl(std::ostream& os);',
  ios: 'typedef std::basic_ios<char> std::ios;',
  sync_with_stdio: 'static bool std::ios_base::sync_with_stdio(bool sync = true);',
  fixed: 'std::ios_base& std::fixed(std::ios_base& str);',
  setprecision: '/*unspecified*/ std::setprecision(int n);',
  hex: 'std::ios_base& std::hex(std::ios_base& str);',
  boolalpha: 'std::ios_base& std::boolalpha(std::ios_base& str);',
  stringstream: 'class std::stringstream;',
  istringstream: 'class std::istringstream;',
  ostringstream: 'class std::ostringstream;',
  getline: 'std::istream& std::getline(std::istream& is, std::string& str);',
  getchar: 'int getchar(void);',
  putchar: 'int putchar(int ch);',
  puts: 'int puts(const char* str);',
  printf: 'int printf(const char* format, ...);',
  scanf: 'int scanf(const char* format, ...);',
  freopen: 'FILE* freopen(const char* filename, const char* mode, FILE* stream);',
  fclose: 'int fclose(FILE* stream);',
  FILE: 'typedef struct _IO_FILE FILE;  // <cstdio>',
  fgets: 'char* fgets(char* buffer, int count, FILE* stream);',
  fputs: 'int fputs(const char* buffer, FILE* stream);',
  fread:
    'std::size_t fread(void* buffer, std::size_t size, std::size_t count, FILE* stream);',
  fwrite:
    'std::size_t fwrite(const void* buffer, std::size_t size, std::size_t count, FILE* stream);',
  stdin: 'extern FILE* stdin;',
  stdout: 'extern FILE* stdout;',
  EOF: '#define EOF (-1)  // <cstdio>',
  // 时间
  steady_clock: 'class std::chrono::steady_clock;',
  high_resolution_clock: 'class std::chrono::high_resolution_clock;',
  system_clock: 'class std::chrono::system_clock;',
  duration_cast:
    'template<class ToDuration, class Rep, class Period> ToDuration std::chrono::duration_cast(std::chrono::duration<Rep, Period> d);',
  milliseconds: 'typedef std::chrono::duration<long long, std::milli> std::chrono::milliseconds;',
  microseconds:
    'typedef std::chrono::duration<long long, std::micro> std::chrono::microseconds;',
  nanoseconds: 'typedef std::chrono::duration<long long, std::nano> std::chrono::nanoseconds;',
  clock: 'std::clock_t clock(void);',
  CLOCKS_PER_SEC: '#define CLOCKS_PER_SEC 1000000  // <ctime>',
  time: 'std::time_t time(std::time_t* arg);',
  time_t: 'typedef /* implementation-defined */ std::time_t;',
  difftime: 'double difftime(std::time_t end, std::time_t begin);',
  // C 库与内存
  memset: 'void* memset(void* dest, int value, std::size_t count);',
  memcpy: 'void* memcpy(void* dest, const void* src, std::size_t count);',
  assert: '#define assert(expr) /* implementation-defined */  // <cassert>',
  // 常量与定长类型
  INT_MAX: '#define INT_MAX 2147483647  // <climits>',
  INT_MIN: '#define INT_MIN (-2147483647 - 1)  // <climits>',
  UINT_MAX: '#define UINT_MAX 4294967295U  // <climits>',
  LLONG_MAX: '#define LLONG_MAX 9223372036854775807LL  // <climits>',
  LLONG_MIN: '#define LLONG_MIN (-9223372036854775807LL - 1)  // <climits>',
  ULLONG_MAX: '#define ULLONG_MAX 18446744073709551615ULL  // <climits>',
  CHAR_BIT: '#define CHAR_BIT 8  // <climits>',
  INT64_MAX: '#define INT64_MAX 9223372036854775807LL  // <cstdint>',
  INT64_MIN: '#define INT64_MIN (-9223372036854775807LL - 1)  // <cstdint>',
  UINT64_MAX: '#define UINT64_MAX 18446744073709551615ULL  // <cstdint>',
  SIZE_MAX: '#define SIZE_MAX 18446744073709551615ULL  // <cstdint>',
  DBL_MAX: '#define DBL_MAX 1.7976931348623157e+308  // <cfloat>',
  DBL_MIN: '#define DBL_MIN 2.2250738585072014e-308  // <cfloat>',
  DBL_EPSILON: '#define DBL_EPSILON 2.220446049250313e-16  // <cfloat>',
  INFINITY: '#define INFINITY /* implementation-defined */  // <math.h>',
  NAN: '#define NAN /* implementation-defined */  // <math.h>',
  M_PI: '#define M_PI 3.14159265358979323846  // <math.h>',
  size_t: 'typedef /* implementation-defined */ std::size_t;',
  ptrdiff_t: 'typedef /* implementation-defined */ std::ptrdiff_t;',
  int8_t: 'typedef /* implementation-defined */ std::int8_t;',
  uint8_t: 'typedef /* implementation-defined */ std::uint8_t;',
  int16_t: 'typedef /* implementation-defined */ std::int16_t;',
  uint16_t: 'typedef /* implementation-defined */ std::uint16_t;',
  int32_t: 'typedef /* implementation-defined */ std::int32_t;',
  int64_t: 'typedef /* implementation-defined */ std::int64_t;',
  uint32_t: 'typedef /* implementation-defined */ std::uint32_t;',
  uint64_t: 'typedef /* implementation-defined */ std::uint64_t;',
  __int128: 'typedef __int128 __int128_t;  // GCC extension',
  __uint128_t: 'typedef unsigned __int128 __uint128_t;',
}

/** 允许出现在 `X::` 前面的标准库命名空间（`std::chrono::` 取到的最后一段是 `chrono`） */
const STD_QUALIFIERS = new Set([
  'std',
  'ios',
  'ios_base',
  'chrono',
  '__gnu_cxx',
  'literals',
  'filesystem',
])

/**
 * 光标所在行、光标之前的那段文本，用来判断这个标识符是不是「成员访问」或
 * 「别的命名空间里的同名符号」—— 静态表只有标准库，`v.sort()` 这种不该弹。
 *
 * 标准库的命名空间是有限的几个（`std` 之外，`ios::sync_with_stdio`、
 * `chrono::steady_clock` 这类也常写）；表里登记过的类型名（`string::npos`）同样放行。
 * @param {string} before 从行首到标识符起点
 * @param {Record<string, string>} signatures 静态签名表
 * @returns {boolean} true 表示这一处不该给标准库的签名
 */
function isForeignUse(before, signatures) {
  if (/\.\s*$/.test(before) || /->\s*$/.test(before)) return true
  // 取 `::` 前面最后一段限定符：`std::chrono::steady_clock` 里是 `chrono`
  const qualifier = before.match(/([A-Za-z_]\w*)\s*::\s*$/u)?.[1]
  if (qualifier === undefined) return false
  // 标准库命名空间，以及静态表里登记过的类型（`string::npos` 这类）都放行；
  // 其余限定符（`Box::sort` 之类的用户类）视为别人的同名符号，不弹标准库签名
  return !STD_QUALIFIERS.has(qualifier) && !Object.hasOwn(signatures, qualifier)
}

/**
 * 位置是否落在注释或字符串里。悬停不该在注释里弹标准库文档。
 * Monaco 的 tokenize 是按语言给的静态分词（C/C++ 同步分词器），代价只有一行。
 * @param {import('monaco-editor').editor.ITextModel} model
 * @param {{ lineNumber: number, column: number }} position
 */
function insideCommentOrString(model, position) {
  const line = model.getLineContent(position.lineNumber)
  if (/#\s*include/.test(line)) return true
  const tokens = monaco.editor.tokenize(line, model.getLanguageId())[0] ?? []
  const offset = position.column - 1
  let type = ''
  for (const token of tokens) {
    if (token.offset > offset) break
    type = token.type
  }
  return /comment|string/i.test(type)
}

/** @param {Record<string, string>} signatures */
function makeProvider(signatures) {
  return {
    async provideHover(model, position) {
      if (!editorSettings.value.hover) return null
      const word = model.getWordAtPosition(position)
      if (!word) return null
      if (insideCommentOrString(model, position)) return null

      const range = new monaco.Range(
        position.lineNumber,
        word.startColumn,
        position.lineNumber,
        word.endColumn,
      )

      // 标准库优先：命中就不去加载语法引擎（见文件头的取舍说明）
      const before = model.getLineContent(position.lineNumber).slice(0, word.startColumn - 1)
      const signature = signatures[word.word]
      if (signature && !isForeignUse(before, signatures)) {
        return { range, contents: [{ value: '```cpp\n' + signature + '\n```' }] }
      }

      const user = await findCppFunction(model, position)
      // `auto` 变量：语法层只知道写了 `auto`（最多按初始化式猜一个），真实类型得问 clang。
      // 开着语义分析时先让语义层回答；它没结论（宿主忙 / 推不出来）再退回语法层的结果。
      const semanticEnabled = editorSettings.value.semanticHover
      if (user !== null && !(user.auto === true && semanticEnabled)) {
        return userHover(range, user)
      }

      // 语义分析是可选包：静态表与语法树都没结论时才轮到它（容器成员、结构体字段、
      // 重载这些只有它给得出）。它自己保证软失败，任何异常都只是「这处没有结论」。
      if (semanticEnabled) {
        const semantic = await loadSemanticHover()
        const signature = await semantic?.findSemanticHover(model, position)
        if (signature) return { range, contents: [{ value: '```cpp\n' + signature + '\n```' }] }
      }
      return user === null ? null : userHover(range, user)
    },
  }
}

/**
 * 语法层结果的悬停内容：签名 + 用户自己的注释。
 * 注释是源码内容，随代码走，不随界面语言翻译 —— 英文界面下这段中文注释仍原样显示，
 * 因为编辑器里写的就是中文。
 * @param {import('monaco-editor').IRange} range
 * @param {{ signature: string, comment?: string }} user
 */
function userHover(range, user) {
  const contents = [{ value: '```cpp\n' + user.signature + '\n```' }]
  if (user.comment !== undefined && user.comment !== '') contents.push({ value: user.comment })
  return { range, contents }
}

/**
 * 语义分析是可选包：只有开关打开时才 import，构建时单独成 chunk（没开的人不下载）。
 * 失败就记住 null，避免每次悬停都重试一次坏掉的 chunk。
 */
let semanticPromise = null
function loadSemanticHover() {
  if (semanticPromise === null) {
    semanticPromise = import('./semanticHover.js').catch(() => null)
  }
  return semanticPromise
}

// 页面加载时 immediate 的第一枪不预载：用户可能只是打开页面看题，一行没写、一次都没悬停，
// 没必要先把 26MB 工具链拉下来、再拉起那颗宿主。第一次真正需要由语义查询自己触发
// （findSemanticHover 发现宿主不在时会 resume）。用户手动拨开开关时 previous 有值，
// 照旧立刻下载 —— 那是一次明确的动作。关掉不卸载：宿主还给语法检查 / 运行用着，
// 这里只停止发起语义查询。
watch(
  () => editorSettings.value.semanticHover,
  (enabled, previous) => {
    if (!enabled) {
      // 关掉开关时撤掉可能还在排队的自动重试（见 semanticHover.js 的 scheduleAutoRetry）：
      // 本模块的规矩是「不偷偷下载」，关了这一发就不能还在队列里。
      // 只在模块已经加载过时才去碰它 —— 否则为了取消反而把那个 chunk 拉了下来。
      if (previous === undefined || semanticPromise === null) return
      void semanticPromise.then((module) => module?.cancelSemanticAutoRetry())
      return
    }
    if (previous === undefined) return
    void loadSemanticHover().then((module) => module?.prepareSemanticHover())
  },
  { immediate: true },
)

// 只在 C / C++ 上注册：Python 目前没有静态说明表（补全表另见 completion.js）
//
// 注册结果要能「重新执行时先撤销旧的」：开发时每保存一次，本模块会被重新执行，
// 但 Monaco 的语言注册表不会因为模块重跑就丢掉上一个 provider —— 它们会累加，
// 悬停于是把同一份内容重复 N 遍（表现为一列一模一样的 `int _n;`）。
// 把上一次的注册挂到 globalThis 上，重新执行 / 热更新时先 dispose 再注册。
const staleHoverProviders = globalThis.__cppHoverProviders ?? []
for (const provider of staleHoverProviders) provider.dispose()
const cppHoverProviders = [
  monaco.languages.registerHoverProvider('c', makeProvider(CPP_SIGNATURES)),
  monaco.languages.registerHoverProvider('cpp', makeProvider(CPP_SIGNATURES)),
]
globalThis.__cppHoverProviders = cppHoverProviders
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    for (const provider of cppHoverProviders) provider.dispose()
    globalThis.__cppHoverProviders = []
  })
}
