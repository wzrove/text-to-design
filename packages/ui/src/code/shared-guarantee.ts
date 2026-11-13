/**
 * 编译期契约一致性的**通用类型工具**:三份 sync-guarantee.ts 共用,与平台 typings 无关。
 *
 * 只放「机制」不放「事实」:平台事实(哪一页缺哪个符号、哪张表登记了什么)一律留在
 * 各平台文件里,以类型实参的形式传进来 —— 这里看不到任何具体键名。
 * 详见 docs/architecture-review-2026-11-14.md §5(P3)。
 *
 * ⚠ 纯类型:导入方一律 `import type`,类型全部 `export type`;任何值导出都会让
 * 打包产物多一个模块,而本文件在运行时应当**不存在**。
 */

/**
 * 断言 T 为 never;不是 never 时编译错误会打出违规的键名
 * (`Type 'xxx' does not satisfy the constraint 'never'`)。**别改成别的写法** ——
 * 报键名是这些断言的唯一用法。
 */
export type ExpectNever<T extends never> = T;

/** 联合类型全部成员的键并集(逐成员分配再并起来) */
export type KeysOf<T> = T extends unknown ? keyof T : never;

/**
 * 契约成员里运行时没有的键 —— **映射成键名**,故失败时错误里带名字;非 never 即幻影符号。
 * ⚠ `K extends unknown` 是必须的:不逐键分配就整条并集一起判,**错误里只报并集不点名**。
 */
export type Missing<K extends string, T> = K extends unknown
  ? K extends KeysOf<T>
    ? never
    : K
  : never;

/** 该键被 typings 声明了。只为 `= true` 那条反向断言存在,别放进联合里求并 */
export type Declared<K extends string, T> = K extends KeysOf<T> ? true : never;

/** 线格式有、运行时没有的键 —— 非 never 即线格式写了幻影字段 */
export type ExtraKeys<W, R> = Exclude<keyof W, keyof R>;

// ---- 契约成员存在性:三份文件里同形,只有「缺口表」是平台事实 ----
//
// ⚠ 这里必须是 interface 而不是 type alias:type alias 的 `extends never` 在**声明处**
// 就判(未实例化的参数直接报错),interface 的成员类型位置才推迟到实例化。
// 故每条检查拆成「interface 算出差集」+ 调用点 `ExpectNever<X['check']>` —— 键名照报。

/** `keyof` 去符号并逐成员分配;`Keys<P>` 不分配会让 `Missing` 只报并集、不点名 */
type Keys<K> = K extends unknown ? keyof K & string : never;

export interface HostContractCheck<P, Gap extends string> {
  check: Missing<Exclude<Keys<P>, Gap>, PluginAPI>;
}

/**
 * 页对象在 MG 挂在 PluginAPI['document'] 下,故宿主页类型可作实参传入。
 * 默认值必须是**条件类型**:直接写 `PluginAPI['currentPage']` 会在 MG 域(没有顶层 currentPage)
 * 的声明处就报错。
 */
export interface PageContractCheck<
  P,
  HostPage = PluginAPI extends { currentPage: infer C } ? C : never,
> {
  check: Missing<Keys<P>, HostPage>;
}

export interface UiContractCheck<
  P extends { ui: unknown },
  Gap extends string,
> {
  check: Missing<Exclude<Keys<P['ui']>, Gap>, PluginAPI['ui']>;
}

export interface ViewportContractCheck<P extends { viewport: unknown }> {
  check: Missing<Keys<P['viewport']>, PluginAPI['viewport']>;
}

export interface NodeContractCheck<P, Gap extends string> {
  check: Missing<Exclude<Keys<P>, Gap>, SceneNode>;
}
