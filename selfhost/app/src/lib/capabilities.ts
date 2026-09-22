/**
 * Ordered by how many people actually use each client, because this order is
 * the order of the chips on the page and the first two carry most of the
 * traffic. Clash / Mihomo and Shadowrocket are not a judgement call; the rest
 * are: sing-box is free and cross-platform and has grown fastest, Surge is
 * paid but widely used, Loon sits under it on iOS with an active script
 * community, Quantumult X still has an installed base but little development,
 * and the last three are legacy. Reordering is one move of a key.
 */
export const TARGET_DEFINITIONS = {
  clash: {
    label: "Clash / Mihomo",
    shortLabel: "Clash",
    engineTarget: "clash",
    engineParams: {},
    extension: "yaml",
    contentType: "text/yaml; charset=utf-8",
    clientFamily: "Mihomo 内核客户端",
    clientExamples: ["Clash Verge Rev", "Mihomo Party", "FlClash"],
    tier: "mainstream",
    protocolNote: "已验证保留 AnyTLS、Hysteria2、TUIC 与 VLESS Reality",
    verifiedModernProtocols: [
      "AnyTLS",
      "Hysteria2",
      "TUIC",
      "VLESS Reality",
    ],
  },
  shadowrocket: {
    label: "Shadowrocket",
    shortLabel: "Shadowrocket",
    // The engine's Surge 4 renderer gives us Shadowrocket's native sectioned
    // configuration shape. The gateway then restores modern nodes from a
    // lossless Mihomo node pass and pins each select group's first policy.
    engineTarget: "surge",
    engineParams: { ver: "4" },
    extension: "conf",
    contentType: "text/plain; charset=utf-8",
    clientFamily: "Shadowrocket 原生配置",
    clientExamples: ["Shadowrocket"],
    tier: "mainstream",
    // Structural retention is covered by the conversion suite. A live device
    // connection check has not yet been run for every modern protocol, so the
    // verified list remains conservative.
    protocolNote:
      "原生配置导入已真机验证：保留 DIRECT、REJECT、手动切换、策略组嵌套与节点；现代协议连接能力以客户端为准",
    verifiedModernProtocols: [],
  },
  singbox: {
    label: "sing-box",
    shortLabel: "sing-box",
    engineTarget: "singbox",
    engineParams: {},
    extension: "json",
    contentType: "application/json; charset=utf-8",
    clientFamily: "sing-box 配置客户端",
    clientExamples: ["sing-box", "SFI", "SFA"],
    tier: "mainstream",
    protocolNote: "已验证保留 AnyTLS、Hysteria2、TUIC 与 VLESS Reality",
    verifiedModernProtocols: [
      "AnyTLS",
      "Hysteria2",
      "TUIC",
      "VLESS Reality",
    ],
  },
  surge: {
    label: "Surge 4+",
    shortLabel: "Surge",
    engineTarget: "surge",
    engineParams: { ver: "4" },
    extension: "conf",
    contentType: "text/plain; charset=utf-8",
    clientFamily: "Surge 客户端",
    clientExamples: ["Surge for Mac", "Surge for iOS"],
    tier: "mainstream",
    protocolNote: "输入仍会自动识别，不兼容节点按 Surge 能力过滤",
    verifiedModernProtocols: [],
  },
  loon: {
    label: "Loon",
    shortLabel: "Loon",
    engineTarget: "loon",
    engineParams: {},
    extension: "conf",
    contentType: "text/plain; charset=utf-8",
    clientFamily: "Loon",
    clientExamples: ["Loon"],
    tier: "mainstream",
    protocolNote: "输入仍会自动识别，不兼容节点按 Loon 能力过滤",
    verifiedModernProtocols: ["Hysteria2"],
  },
  quanx: {
    label: "Quantumult X",
    shortLabel: "QuanX",
    engineTarget: "quanx",
    engineParams: {},
    extension: "conf",
    contentType: "text/plain; charset=utf-8",
    clientFamily: "Quantumult X",
    clientExamples: ["Quantumult X"],
    tier: "mainstream",
    protocolNote: "输入仍会自动识别，不兼容节点按 Quantumult X 能力过滤",
    verifiedModernProtocols: ["VLESS Reality"],
  },
  surfboard: {
    label: "Surfboard",
    shortLabel: "Surfboard",
    engineTarget: "surfboard",
    engineParams: {},
    extension: "conf",
    contentType: "text/plain; charset=utf-8",
    clientFamily: "Surfboard",
    clientExamples: ["Surfboard"],
    tier: "mainstream",
    protocolNote: "输入仍会自动识别，不兼容节点按 Surfboard 能力过滤",
    verifiedModernProtocols: [],
  },
  quan: {
    label: "Quantumult",
    shortLabel: "Quantumult",
    engineTarget: "quan",
    engineParams: {},
    extension: "conf",
    contentType: "text/plain; charset=utf-8",
    clientFamily: "Quantumult",
    clientExamples: ["Quantumult"],
    tier: "compatibility",
    protocolNote: "旧版兼容输出；现代协议通常会被过滤",
    verifiedModernProtocols: [],
  },
  mellow: {
    label: "Mellow",
    shortLabel: "Mellow",
    engineTarget: "mellow",
    engineParams: {},
    extension: "conf",
    contentType: "text/plain; charset=utf-8",
    clientFamily: "Mellow",
    clientExamples: ["Mellow"],
    tier: "compatibility",
    protocolNote: "兼容输出；现代协议通常会被过滤",
    verifiedModernProtocols: [],
  },
} as const;

export type TargetFormat = keyof typeof TARGET_DEFINITIONS;

export const SUPPORTED_TARGETS = Object.keys(
  TARGET_DEFINITIONS,
) as TargetFormat[];

export function isSupportedTarget(value: string): value is TargetFormat {
  return Object.hasOwn(TARGET_DEFINITIONS, value);
}

/**
 * Targets whose body is a Mihomo configuration file. Derived from the table
 * above rather than listed again.
 */
export type MihomoTarget = {
  [Key in TargetFormat]: (typeof TARGET_DEFINITIONS)[Key]["engineTarget"] extends "clash"
    ? Key
    : never;
}[TargetFormat];

/**
 * Every step that exists because the output is Mihomo — provider inlining,
 * credential quoting and completeness checks — keys off this predicate.
 */
export function usesMihomoOutput(target: TargetFormat): target is MihomoTarget {
  return TARGET_DEFINITIONS[target].engineTarget === "clash";
}

export function targetDefinition(target: TargetFormat) {
  return TARGET_DEFINITIONS[target];
}

export function buildCapabilitiesPayload() {
  return {
    mode: "personal-local-subscription",
    public_endpoint_mode: false,
    custom_remote_gateway: false,
    supported_targets: SUPPORTED_TARGETS.map((id) => ({
      id,
      label: TARGET_DEFINITIONS[id].label,
      short_label: TARGET_DEFINITIONS[id].shortLabel,
      client_family: TARGET_DEFINITIONS[id].clientFamily,
      client_examples: [...TARGET_DEFINITIONS[id].clientExamples],
      extension: TARGET_DEFINITIONS[id].extension,
      tier: TARGET_DEFINITIONS[id].tier,
      protocol_note: TARGET_DEFINITIONS[id].protocolNote,
      verified_modern_protocols: [
        ...TARGET_DEFINITIONS[id].verifiedModernProtocols,
      ],
    })),
    input_protocol_behavior: {
      automatic_detection: true,
      no_protocol_selector: true,
      verified_by_engine: [
        "AnyTLS",
        "Hysteria2",
        "TUIC",
        "VLESS Reality",
      ],
      output_depends_on_target_client: true,
    },
    advanced_options: [
      "emoji",
      "udp",
      "xudp",
      "tfo",
      "skip_cert_verify",
      "tls_1_3",
      "sort",
      "filter_unsupported",
      "append_type",
      "include",
      "exclude",
      "rename",
      "custom_user_agent",
      "auto_update",
      "update_interval",
      "singbox_ipv6",
    ],
    fixed_remote_config: "config/ekko-rules-selfhost.ini",
    profile_behavior: {
      survives_restart: true,
      survives_compose_down: true,
      removed_by_compose_down_v: true,
      stores_generated_configs: false,
      auto_update_default: false,
    },
    notes: [
      "订阅 URL 只包含随机 ID，不包含真实订阅地址。",
      "Docker 运行时可用原地址更新，普通重启后仍有效。",
      "自动更新默认关闭，可按档案设置为 1 到 168 小时。",
      "只保存源地址、输出格式与高级选项，不保存节点和转换结果历史。",
    ],
  };
}
