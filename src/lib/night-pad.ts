/** The ten glasses on the door, in keypad order. Ids are the code; names match GlassIcon. */
export const KNOCK_PAD = [
  { id: "martini", name: "martini", label: "Martini" },
  { id: "coupe", name: "coupe", label: "Coupe" },
  { id: "nicknora", name: "nick & nora", label: "Nick and Nora" },
  { id: "rocks", name: "rocks", label: "Rocks" },
  { id: "highball", name: "highball", label: "Highball" },
  { id: "collins", name: "collins", label: "Collins" },
  { id: "wine", name: "wine glass", label: "Wine glass" },
  { id: "flute", name: "flute", label: "Flute" },
  { id: "hurricane", name: "hurricane", label: "Hurricane" },
  { id: "mug", name: "mug", label: "Mug" },
] as const;

export type KnockId = (typeof KNOCK_PAD)[number]["id"];

const IDS = new Set<string>(KNOCK_PAD.map((glass) => glass.id));

export function isKnockId(value: string): value is KnockId {
  return IDS.has(value);
}

export function knockGlass(id: string) {
  return KNOCK_PAD.find((glass) => glass.id === id);
}
