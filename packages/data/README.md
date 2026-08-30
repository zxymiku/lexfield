# @lexfield/data

四六级全量词库的构建管道。产出被 Web / Android / EXE / CLI 四端共用的 `dist/lexfield-vocab.json`。

## 数据来源

| 用途 | 来源 | 协议 |
|---|---|---|
| 词表成员(完整性基准) | [hehonghui/en_dict](https://github.com/hehonghui/en_dict) `CET4_edited.txt`(4,615 词,贵州大学出版社版大纲)、`CET6_edited.txt`(2,218 词,2016 版四六级考试大纲) | 未声明 |
| 词表成员(交叉补全) | [ismartcoding/endict](https://github.com/ismartcoding/endict) `vocabulary/cet4.json`、`cet6.json` | MIT |
| 词表成员(交叉补全) | [skywind3000/ECDICT](https://github.com/skywind3000/ECDICT) `cet4` / `cet6` 标签 | MIT |
| 全部释义 / 英英释义 / 音标 / 词形变化 / 词频 | ECDICT `ecdict.csv`(77 万词条) | MIT |

> 注:两个大纲词表仓库未声明开源协议,词库数据仅供个人学习研究使用,请勿商用。

## 成员策略

`cet4` = 三来源并集(1 位),`cet6` = 三来源并集(2 位),两级兼有为 3。ECDICT 标签存在系统性缺漏(仅 3,849 个 cet4 词,低于官方 4,615),因此以官方大纲词表为完整性基准,ECDICT 仅作交叉补全。

## 条目格式(压缩键)

```jsonc
{
  "w": "abandon",            // word
  "lv": 3,                   // 1=cet4, 2=cet6, 3=both
  "s": [                     // senses - 全部词性义项,永不截断
    { "pos": "vt.", "cn": "丢弃；放弃，抛弃" }
  ],
  "p": "əˈbændən",           // phonetic (可选)
  "en": ["to leave..."],     // english definitions (可选, ≤6 条)
  "x": { "p": "abandoned" }, // word forms: p过去式 d过去分词 i现在分词 3三单 s复数 r比较级 t最高级
  "f": 1234,                 // contemporary corpus frequency rank (可选)
  "b": 1456,                 // BNC rank (可选)
  "c": 3                     // Collins star 1-5 (可选)
}
```

## 使用

```bash
pnpm --filter @lexfield/data build
```

产物写入 `dist/`(词库 JSON 提交入库,其余端无需重新运行 ETL);原始下载缓存在 `.cache/`(已 gitignore,65.9 MB)。
