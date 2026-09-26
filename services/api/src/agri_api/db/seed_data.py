"""Static reference content for the seed: the store catalog and the issue catalog.

The issue copy is farmer-facing and deliberately plain: no Latin in the sentence a
grower reads at 6am, and "what to do" is an action, not a description.
"""

from typing import Final, TypedDict

from agri_api.db.enums import AppCategory, IssueType


class AppSpec(TypedDict):
    slug: str
    name: str
    tagline: str
    description: str
    category: AppCategory
    icon: str
    featured: bool
    flow_position: int | None
    sort_order: int
    route: str


STORE_APPS: Final[list[AppSpec]] = [
    {
        "slug": "crop-scout",
        "name": "Crop Scout",
        "tagline": "Drive the robot and spot problems as it goes",
        "description": (
            "Watch both cameras while the robot moves down the rows. Problems are outlined "
            "as they are found, and every one is pinned on the field map with its location."
        ),
        "category": AppCategory.FIELD_OPS,
        "icon": "scout",
        "featured": True,
        "flow_position": 2,
        "sort_order": 1,
        "route": "/apps/crop-scout",
    },
    {
        "slug": "mission-planner",
        "name": "Mission Planner",
        "tagline": "Plan a route, or drive it yourself",
        "description": (
            "Set the robot to cover the rows on its own, or take the controls. Includes the "
            "sprayer: arm it, set the nozzle and flow, and treat flagged plants as you go."
        ),
        "category": AppCategory.FIELD_OPS,
        "icon": "route",
        "featured": False,
        "flow_position": 1,
        "sort_order": 2,
        "route": "/apps/mission-planner",
    },
    {
        "slug": "crop-health",
        "name": "Crop Health",
        "tagline": "What was found, where, and what to do",
        "description": (
            "Every flagged plant from every scouting run, grouped into hotspots with a photo, "
            "its GPS location and the row to walk to. Tells you what it is and what to do."
        ),
        "category": AppCategory.INSIGHTS,
        "icon": "leaf",
        "featured": False,
        "flow_position": 3,
        "sort_order": 3,
        "route": "/apps/crop-health",
    },
    {
        "slug": "dashboard",
        "name": "Dashboard",
        "tagline": "How the robot itself is doing",
        "description": (
            "Battery, signal, sensors and onboard computer at a glance, plus the settings "
            "that change how the robot drives and how sensitive its detection is."
        ),
        "category": AppCategory.ROBOT,
        "icon": "gauge",
        "featured": False,
        "flow_position": None,
        "sort_order": 4,
        "route": "/apps/dashboard",
    },
]


class IssueSpec(TypedDict):
    code: str
    name: str
    scientific_name: str | None
    issue_type: IssueType
    what_it_is: str
    what_to_do: str
    action_within_days: int


ISSUE_CATALOG: Final[list[IssueSpec]] = [
    {
        "code": "late_blight",
        "name": "Late blight",
        "scientific_name": "Phytophthora infestans",
        "issue_type": IssueType.FUNGUS,
        "what_it_is": (
            "A fast-moving fungus that thrives in warm, wet weather. Leaves get dark, greasy "
            "patches with a pale fuzzy edge, and the plant can collapse within days."
        ),
        "what_to_do": (
            "Act quickly. Remove and bag badly affected plants — do not compost them. Spray "
            "the surrounding rows with a protective fungicide, and avoid watering the leaves."
        ),
        "action_within_days": 2,
    },
    {
        "code": "early_blight",
        "name": "Early blight",
        "scientific_name": "Alternaria solani",
        "issue_type": IssueType.FUNGUS,
        "what_it_is": (
            "A common fungus that shows as brown spots with rings, like a target, starting on "
            "the older leaves near the ground. It spreads slowly upward."
        ),
        "what_to_do": (
            "Pick off affected lower leaves and clear debris from around the stem. Spray if it "
            "reaches more than a few plants in a row. Water at the base, not from above."
        ),
        "action_within_days": 7,
    },
    {
        "code": "leaf_mold",
        "name": "Leaf mold",
        "scientific_name": "Passalora fulva",
        "issue_type": IssueType.FUNGUS,
        "what_it_is": (
            "Pale yellow blotches on the top of the leaf with olive-grey fuzz underneath. It "
            "takes hold where air does not move well and humidity stays high."
        ),
        "what_to_do": (
            "Improve airflow: thin the leaves and widen the gaps between plants. Lower the "
            "humidity if you can. Spray only if it keeps spreading after that."
        ),
        "action_within_days": 5,
    },
    {
        "code": "aphid_colony",
        "name": "Aphid colony",
        "scientific_name": "Macrosiphum euphorbiae",
        "issue_type": IssueType.INSECT,
        "what_it_is": (
            "Clusters of small soft green or pink insects on new growth and the underside of "
            "leaves. They weaken the plant and leave a sticky residue that attracts mold."
        ),
        "what_to_do": (
            "Knock small colonies off with a strong spray of water. For larger ones use an "
            "insecticidal soap. Check the surrounding plants — they rarely stay in one spot."
        ),
        "action_within_days": 4,
    },
    {
        "code": "spider_mites",
        "name": "Spider mites",
        "scientific_name": "Tetranychus urticae",
        "issue_type": IssueType.INSECT,
        "what_it_is": (
            "Tiny mites that cause fine pale speckling on leaves, with faint webbing underneath. "
            "They multiply fast in hot, dry conditions."
        ),
        "what_to_do": (
            "Raise the humidity around the plants and rinse the undersides of the leaves. Treat "
            "with a miticide if the speckling spreads, and check plants either side."
        ),
        "action_within_days": 4,
    },
    {
        "code": "leaf_miner",
        "name": "Leaf miner",
        "scientific_name": "Liriomyza spp.",
        "issue_type": IssueType.INSECT,
        "what_it_is": (
            "Pale winding trails inside the leaf, made by larvae feeding between its surfaces. "
            "Light damage is cosmetic; heavy damage reduces the crop."
        ),
        "what_to_do": (
            "Pick off and destroy the mined leaves. Set yellow sticky traps to catch the adult "
            "flies. Only spray if a large share of the leaves on a plant are affected."
        ),
        "action_within_days": 10,
    },
]
