import type { BuildingType, BuildingTypeModel } from "./types"

/**
 * Per-building-type "persona" model that drives generation.
 * `rate` is baseline kg / unit / day where unit depends on the type
 * (person, m², seat, room, student).
 */
export const BUILDING_TYPES: Record<BuildingType, BuildingTypeModel> = {
  residential: { color: "#6f8f9c", rate: 0.45, unit: "person", occPerFloor: [4, 8] },
  office: { color: "#c98b3f", rate: 0.15, unit: "m2", occPerFloor: [1, 1] },
  retail: { color: "#c9a13f", rate: 0.25, unit: "m2", occPerFloor: [1, 1] },
  restaurant: { color: "#d97b4a", rate: 1.8, unit: "seat", occPerFloor: [20, 40] },
  hotel: { color: "#7d6fae", rate: 0.9, unit: "room", occPerFloor: [8, 16] },
  school: { color: "#4fb0a5", rate: 0.07, unit: "student", occPerFloor: [100, 200] },
}

export const TYPE_KEYS = Object.keys(BUILDING_TYPES) as BuildingType[]

export const TYPE_WEIGHTS = [0.42, 0.12, 0.16, 0.14, 0.08, 0.08]

/** Map OSM tags to our internal building-type model. */
export function osmTypeToModel(tags: Record<string, string> | undefined): BuildingType {
  tags = tags || {}
  const amenity = tags.amenity
  const building = tags.building
  const shop = tags.shop
  const tourism = tags.tourism

  if (["restaurant", "cafe", "fast_food", "bar", "pub"].includes(amenity ?? "")) return "restaurant"
  if (building === "hotel" || tourism === "hotel") return "hotel"
  if (["school", "university", "college", "kindergarten"].includes(amenity ?? ""))
    return "school"
  if (building === "school") return "school"
  if (building === "office" || tags.office) return "office"
  if (building === "commercial" || building === "retail" || shop) return "retail"
  if (
    ["residential", "apartments", "house", "houses", "detached", "terrace", "dormitory", "bungalow"].includes(
      building ?? ""
    )
  )
    return "residential"
  return "residential"
}

export function defaultFloorsFor(type: BuildingType): number {
  return { residential: 3, retail: 2, office: 2, restaurant: 1, hotel: 4, school: 1 }[type] ?? 2
}
