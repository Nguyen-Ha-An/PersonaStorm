"""Target-market presets — the Persona Space Builder's raw material.

Each preset defines 3-4 sub-segments with trait *distributions* (mean, std),
not fixed values. The generator samples from these, so 1,000 personas are all
different, yet the population is statistically shaped like the target market.
The custom preset is built heuristically from the user's free-text description.

Calibration note: distributions here are hand-tuned priors for P0. The
training roadmap (docs/training-roadmap.md) replaces them with survey-derived
distributions per market.
"""

from __future__ import annotations

from dataclasses import dataclass, field

Trait = tuple[float, float]  # (mean, std)


@dataclass(frozen=True)
class SubSegmentSpec:
    name: str                       # self-contained human label (used as `segment`)
    weight: float
    age_range: tuple[int, int]
    regions: list[str]
    income_bands: list[tuple[str, tuple[float, float]]]  # (label, monthly USD budget range)
    occupations: list[str]
    traits: dict[str, Trait]
    familiarity: list[str]          # weighted choices
    research_styles: list[str]
    buying_triggers: list[str]
    dealbreaker_pool: list[str]


@dataclass(frozen=True)
class PresetSpec:
    key: str
    id_prefix: str
    label: str
    sub_segments: list[SubSegmentSpec] = field(default_factory=list)


def T(mean: float, std: float = 0.12) -> Trait:
    return (mean, std)


# Shared dealbreaker vocabulary — sub-segments pick different subsets, which is
# what gives objection diversity downstream.
DB = {
    "pricing": "unclear pricing",
    "lockin": "subscription lock-in",
    "trial": "no free trial",
    "corporate": "feels too corporate",
    "proof": "no proof that it works",
    "card": "requires credit card upfront",
    "localpay": "no local payment options (momo/gcash/bank transfer)",
    "privacy": "vague about what happens to my data",
    "security": "no SSO / security documentation",
    "casestudy": "no case studies from companies like ours",
    "onboarding": "long or complicated onboarding",
    "anothertool": "yet another tool for the team to manage",
    "hiddenfees": "hidden fees",
    "reviews": "poor or missing reviews",
    "cancel": "can't cancel anytime",
    "mobile": "not mobile friendly",
    "aihype": "AI hype without concrete specifics",
    "vendorlock": "vendor lock-in / hard data export",
    "compliance": "compliance posture unknown (SOC2/GDPR)",
    "support": "no responsive human support",
    "kids_safety": "not clearly safe for kids",
    "time": "takes too much time to see value",
    "integration": "doesn't fit tools we already use",
    "overkill": "overkill for my simple needs",
}

PRESETS: dict[str, PresetSpec] = {
    # ---------------------------------------------------------------- SEA Gen Z
    "sea_genz": PresetSpec(
        key="sea_genz",
        id_prefix="SEA_GENZ",
        label="SEA Gen Z",
        sub_segments=[
            SubSegmentSpec(
                name="SEA Gen Z budget-conscious student (high-school & college)",
                weight=0.35,
                age_range=(16, 23),
                regions=["Vietnam urban", "Philippines urban", "Indonesia urban", "Thailand urban"],
                income_bands=[("student / family supported", (5, 25)),
                              ("part-time income", (10, 40))],
                occupations=["university student", "student + part-time barista",
                             "student + online seller"],
                traits={"price_sensitivity": T(0.86, 0.08), "skepticism": T(0.66, 0.12),
                        "novelty_seeking": T(0.62, 0.14), "brand_trust": T(0.38, 0.12),
                        "social_influence": T(0.78, 0.10), "risk_tolerance": T(0.45, 0.12),
                        "privacy_sensitivity": T(0.55, 0.14)},
                familiarity=["low", "medium", "medium"],
                research_styles=[
                    "checks TikTok, friends, and reviews before buying",
                    "searches Facebook groups and asks classmates first",
                    "watches a YouTube review, then looks for a promo code",
                ],
                buying_triggers=[
                    "recommended by friends or seen repeatedly on social media",
                    "a student discount or a real free tier",
                    "a creator they follow shows an actual result",
                ],
                dealbreaker_pool=[DB["pricing"], DB["lockin"], DB["corporate"], DB["proof"],
                                  DB["card"], DB["localpay"], DB["mobile"], DB["hiddenfees"]],
            ),
            SubSegmentSpec(
                name="SEA Gen Z gig worker / online seller",
                weight=0.25,
                age_range=(19, 26),
                regions=["Vietnam urban", "Indonesia urban", "Philippines provincial", "Malaysia urban"],
                income_bands=[("gig income, variable", (10, 45))],
                occupations=["ride-hailing driver + reseller", "freelance designer",
                             "TikTok shop seller", "delivery rider"],
                traits={"price_sensitivity": T(0.80, 0.10), "skepticism": T(0.62, 0.12),
                        "novelty_seeking": T(0.58, 0.14), "brand_trust": T(0.42, 0.12),
                        "social_influence": T(0.70, 0.12), "risk_tolerance": T(0.55, 0.12),
                        "privacy_sensitivity": T(0.48, 0.14)},
                familiarity=["low", "medium", "medium", "high"],
                research_styles=[
                    "asks seller communities on Zalo/WhatsApp what they actually use",
                    "tries the free version for a week during real orders",
                ],
                buying_triggers=[
                    "clear proof it increases orders or saves an hour a day",
                    "other sellers in their group chat swear by it",
                ],
                dealbreaker_pool=[DB["pricing"], DB["localpay"], DB["proof"], DB["time"],
                                  DB["mobile"], DB["cancel"], DB["hiddenfees"], DB["support"]],
            ),
            SubSegmentSpec(
                name="SEA Gen Z first-jobber in tech-adjacent role",
                weight=0.25,
                age_range=(21, 27),
                regions=["Ho Chi Minh City", "Jakarta", "Manila", "Bangkok", "Singapore"],
                income_bands=[("junior salary", (20, 80))],
                occupations=["junior marketer", "ops assistant", "junior developer",
                             "customer support agent"],
                traits={"price_sensitivity": T(0.68, 0.12), "skepticism": T(0.58, 0.12),
                        "novelty_seeking": T(0.70, 0.12), "brand_trust": T(0.48, 0.12),
                        "social_influence": T(0.66, 0.12), "risk_tolerance": T(0.55, 0.12),
                        "privacy_sensitivity": T(0.52, 0.12)},
                familiarity=["medium", "medium", "high"],
                research_styles=[
                    "reads a comparison blog post, then asks a senior colleague",
                    "lurks Reddit and local dev/marketing communities",
                ],
                buying_triggers=[
                    "makes them look good at work within the first week",
                    "free tier good enough to show the boss a result",
                ],
                dealbreaker_pool=[DB["pricing"], DB["trial"], DB["aihype"], DB["proof"],
                                  DB["onboarding"], DB["card"], DB["reviews"]],
            ),
            SubSegmentSpec(
                name="SEA Gen Z campus creator / side-hustler",
                weight=0.15,
                age_range=(18, 24),
                regions=["Vietnam urban", "Philippines urban", "Indonesia urban"],
                income_bands=[("creator income, spiky", (15, 60))],
                occupations=["student content creator", "micro-influencer", "esports streamer"],
                traits={"price_sensitivity": T(0.72, 0.12), "skepticism": T(0.52, 0.14),
                        "novelty_seeking": T(0.82, 0.10), "brand_trust": T(0.45, 0.12),
                        "social_influence": T(0.85, 0.08), "risk_tolerance": T(0.65, 0.12),
                        "privacy_sensitivity": T(0.42, 0.14)},
                familiarity=["medium", "high", "high"],
                research_styles=["tries whatever creators they admire are using this month"],
                buying_triggers=["could visibly level up their content this week",
                                 "early-adopter clout in their niche"],
                dealbreaker_pool=[DB["pricing"], DB["mobile"], DB["time"], DB["aihype"],
                                  DB["cancel"], DB["localpay"]],
            ),
        ],
    ),
    # ---------------------------------------------------------------- US SMB
    "us_smb": PresetSpec(
        key="us_smb",
        id_prefix="US_SMB",
        label="US SMB SaaS buyers",
        sub_segments=[
            SubSegmentSpec(
                name="US solo founder / owner-operator",
                weight=0.30,
                age_range=(27, 55),
                regions=["US — Sun Belt metro", "US — Midwest city", "US — remote/rural", "US — coastal metro"],
                income_bands=[("bootstrapped, tight tooling budget", (50, 250)),
                              ("profitable owner-operator", (100, 400))],
                occupations=["ecommerce store owner", "agency of one", "local services owner",
                             "indie SaaS founder"],
                traits={"price_sensitivity": T(0.66, 0.14), "skepticism": T(0.70, 0.12),
                        "novelty_seeking": T(0.55, 0.14), "brand_trust": T(0.45, 0.12),
                        "social_influence": T(0.48, 0.12), "risk_tolerance": T(0.58, 0.12),
                        "privacy_sensitivity": T(0.50, 0.12)},
                familiarity=["medium", "medium", "high"],
                research_styles=[
                    "googles alternatives, reads G2 and one Reddit thread, decides same day",
                    "asks their founder Slack/Discord what's worked",
                ],
                buying_triggers=["obvious ROI they can compute on a napkin",
                                 "a 10-minute setup that replaces a manual chore"],
                dealbreaker_pool=[DB["pricing"], DB["lockin"], DB["proof"], DB["trial"],
                                  DB["hiddenfees"], DB["anothertool"], DB["support"], DB["overkill"]],
            ),
            SubSegmentSpec(
                name="US SMB operations manager (10-50 employees)",
                weight=0.30,
                age_range=(28, 50),
                regions=["US — Midwest city", "US — Texas metro", "US — Southeast metro"],
                income_bands=[("department budget holder", (100, 600))],
                occupations=["operations manager", "office manager", "customer success lead"],
                traits={"price_sensitivity": T(0.58, 0.12), "skepticism": T(0.64, 0.12),
                        "novelty_seeking": T(0.45, 0.12), "brand_trust": T(0.52, 0.12),
                        "social_influence": T(0.50, 0.12), "risk_tolerance": T(0.42, 0.12),
                        "privacy_sensitivity": T(0.55, 0.12)},
                familiarity=["medium", "medium", "high"],
                research_styles=[
                    "shortlists 3 vendors, books demos, checks references",
                    "reads case studies and asks 'who else our size uses this'",
                ],
                buying_triggers=["a peer company they respect already uses it",
                                 "clear migration path from the current spreadsheet mess"],
                dealbreaker_pool=[DB["casestudy"], DB["onboarding"], DB["anothertool"],
                                  DB["integration"], DB["pricing"], DB["support"], DB["vendorlock"]],
            ),
            SubSegmentSpec(
                name="US agency marketing lead buying for clients",
                weight=0.20,
                age_range=(26, 45),
                regions=["US — coastal metro", "US — remote"],
                income_bands=[("agency tooling budget", (150, 800))],
                occupations=["digital agency account lead", "performance marketer", "SEO lead"],
                traits={"price_sensitivity": T(0.52, 0.12), "skepticism": T(0.68, 0.12),
                        "novelty_seeking": T(0.66, 0.12), "brand_trust": T(0.48, 0.12),
                        "social_influence": T(0.60, 0.12), "risk_tolerance": T(0.55, 0.12),
                        "privacy_sensitivity": T(0.45, 0.12)},
                familiarity=["high", "high", "medium"],
                research_styles=["runs a 2-week bake-off against the current stack on one client"],
                buying_triggers=["billable margin: can they charge clients more than it costs",
                                 "white-label or multi-client support"],
                dealbreaker_pool=[DB["pricing"], DB["proof"], DB["aihype"], DB["integration"],
                                  DB["lockin"], DB["reviews"]],
            ),
            SubSegmentSpec(
                name="US SMB IT decision maker (security-minded)",
                weight=0.20,
                age_range=(30, 58),
                regions=["US — Midwest city", "US — Northeast metro"],
                income_bands=[("IT budget line", (200, 1000))],
                occupations=["IT manager", "sysadmin who owns purchasing", "fractional CTO"],
                traits={"price_sensitivity": T(0.48, 0.12), "skepticism": T(0.78, 0.10),
                        "novelty_seeking": T(0.40, 0.12), "brand_trust": T(0.50, 0.12),
                        "social_influence": T(0.38, 0.12), "risk_tolerance": T(0.30, 0.10),
                        "privacy_sensitivity": T(0.78, 0.10)},
                familiarity=["medium", "high", "high"],
                research_styles=["reads security docs first; no SOC2 page, no meeting"],
                buying_triggers=["passes security review without email ping-pong",
                                 "SSO + admin controls out of the box"],
                dealbreaker_pool=[DB["security"], DB["compliance"], DB["privacy"],
                                  DB["vendorlock"], DB["support"], DB["casestudy"]],
            ),
        ],
    ),
    # ---------------------------------------------------------------- Parents
    "parents": PresetSpec(
        key="parents",
        id_prefix="PARENT",
        label="Parents / family buyers",
        sub_segments=[
            SubSegmentSpec(
                name="New parent (kids 0-3), sleep-deprived pragmatist",
                weight=0.30,
                age_range=(26, 40),
                regions=["US suburb", "UK suburb", "Australia metro", "Canada suburb"],
                income_bands=[("single income while on leave", (20, 100)),
                              ("dual income, new expenses", (40, 150))],
                occupations=["parent on leave", "nurse", "teacher", "accountant"],
                traits={"price_sensitivity": T(0.62, 0.14), "skepticism": T(0.60, 0.12),
                        "novelty_seeking": T(0.38, 0.12), "brand_trust": T(0.55, 0.12),
                        "social_influence": T(0.68, 0.12), "risk_tolerance": T(0.30, 0.10),
                        "privacy_sensitivity": T(0.72, 0.12)},
                familiarity=["low", "low", "medium"],
                research_styles=["asks the parents' group chat, reads 3 reviews at 2am"],
                buying_triggers=["another parent says it actually saved them time or sleep",
                                 "easy returns / cancel anytime"],
                dealbreaker_pool=[DB["kids_safety"], DB["privacy"], DB["cancel"], DB["time"],
                                  DB["hiddenfees"], DB["proof"], DB["onboarding"]],
            ),
            SubSegmentSpec(
                name="School-age parent juggling schedules",
                weight=0.30,
                age_range=(32, 48),
                regions=["US suburb", "US — Texas metro", "UK suburb"],
                income_bands=[("household budgeter", (30, 150))],
                occupations=["project manager", "retail manager", "small business owner", "teacher"],
                traits={"price_sensitivity": T(0.58, 0.12), "skepticism": T(0.56, 0.12),
                        "novelty_seeking": T(0.42, 0.12), "brand_trust": T(0.58, 0.12),
                        "social_influence": T(0.62, 0.12), "risk_tolerance": T(0.38, 0.12),
                        "privacy_sensitivity": T(0.66, 0.12)},
                familiarity=["low", "medium", "medium"],
                research_styles=["compares 2-3 options on the weekend, asks spouse before buying"],
                buying_triggers=["visibly removes a weekly friction (carpool, homework, meals)",
                                 "school or other parents already use it"],
                dealbreaker_pool=[DB["time"], DB["kids_safety"], DB["lockin"], DB["pricing"],
                                  DB["anothertool"], DB["mobile"]],
            ),
            SubSegmentSpec(
                name="Budget-focused single parent",
                weight=0.20,
                age_range=(24, 45),
                regions=["US — Midwest city", "US — Southeast metro", "UK city"],
                income_bands=[("every dollar counted", (10, 60))],
                occupations=["healthcare aide", "administrative assistant", "gig worker"],
                traits={"price_sensitivity": T(0.88, 0.08), "skepticism": T(0.68, 0.12),
                        "novelty_seeking": T(0.35, 0.12), "brand_trust": T(0.45, 0.12),
                        "social_influence": T(0.58, 0.12), "risk_tolerance": T(0.25, 0.10),
                        "privacy_sensitivity": T(0.62, 0.12)},
                familiarity=["low", "low", "medium"],
                research_styles=["hunts for the free alternative first, always"],
                buying_triggers=["a real free tier that stays free",
                                 "pays for itself within the month, provably"],
                dealbreaker_pool=[DB["pricing"], DB["card"], DB["hiddenfees"], DB["cancel"],
                                  DB["lockin"], DB["proof"]],
            ),
            SubSegmentSpec(
                name="Dual-income convenience-seeking parent",
                weight=0.20,
                age_range=(30, 46),
                regions=["US — coastal metro", "Singapore", "Australia metro"],
                income_bands=[("time-poor, cash-flexible", (60, 250))],
                occupations=["consultant", "software engineer", "physician", "lawyer"],
                traits={"price_sensitivity": T(0.35, 0.12), "skepticism": T(0.55, 0.12),
                        "novelty_seeking": T(0.55, 0.12), "brand_trust": T(0.60, 0.12),
                        "social_influence": T(0.52, 0.12), "risk_tolerance": T(0.48, 0.12),
                        "privacy_sensitivity": T(0.68, 0.12)},
                familiarity=["medium", "medium", "high"],
                research_styles=["skims premium reviews; buys fast if it looks polished and safe"],
                buying_triggers=["saves an hour a week with zero setup drama",
                                 "premium feel + strong privacy stance"],
                dealbreaker_pool=[DB["time"], DB["privacy"], DB["kids_safety"], DB["support"],
                                  DB["onboarding"], DB["reviews"]],
            ),
        ],
    ),
    # ---------------------------------------------------------------- Enterprise
    "enterprise": PresetSpec(
        key="enterprise",
        id_prefix="ENT",
        label="Enterprise buyers",
        sub_segments=[
            SubSegmentSpec(
                name="Enterprise procurement / finance gatekeeper",
                weight=0.25,
                age_range=(32, 58),
                regions=["US — Northeast metro", "UK — London", "Germany — Frankfurt", "Singapore"],
                income_bands=[("controls six-figure budgets", (500, 5000))],
                occupations=["procurement manager", "finance controller", "vendor manager"],
                traits={"price_sensitivity": T(0.62, 0.12), "skepticism": T(0.80, 0.08),
                        "novelty_seeking": T(0.28, 0.10), "brand_trust": T(0.55, 0.12),
                        "social_influence": T(0.35, 0.10), "risk_tolerance": T(0.22, 0.08),
                        "privacy_sensitivity": T(0.70, 0.10)},
                familiarity=["medium", "medium", "high"],
                research_styles=["RFP, references from 2 comparable enterprises, legal review"],
                buying_triggers=["passes vendor risk assessment and shows TCO advantage",
                                 "an exec sponsor pushing + references check out"],
                dealbreaker_pool=[DB["compliance"], DB["security"], DB["casestudy"],
                                  DB["vendorlock"], DB["pricing"], DB["support"]],
            ),
            SubSegmentSpec(
                name="Enterprise security & compliance officer",
                weight=0.25,
                age_range=(34, 58),
                regions=["US — Northeast metro", "US — Texas metro", "EU — Netherlands"],
                income_bands=[("veto power, no budget", (300, 3000))],
                occupations=["CISO office lead", "GRC manager", "data protection officer"],
                traits={"price_sensitivity": T(0.40, 0.12), "skepticism": T(0.88, 0.06),
                        "novelty_seeking": T(0.25, 0.10), "brand_trust": T(0.45, 0.12),
                        "social_influence": T(0.30, 0.10), "risk_tolerance": T(0.15, 0.07),
                        "privacy_sensitivity": T(0.90, 0.06)},
                familiarity=["medium", "high", "high"],
                research_styles=["reads the DPA, pen-test summary and data-flow diagram before anything else"],
                buying_triggers=["clean security architecture + evidence, not marketing claims"],
                dealbreaker_pool=[DB["security"], DB["compliance"], DB["privacy"],
                                  DB["aihype"], DB["vendorlock"]],
            ),
            SubSegmentSpec(
                name="Enterprise line-of-business VP under KPI pressure",
                weight=0.30,
                age_range=(35, 55),
                regions=["US — coastal metro", "US — Midwest HQ", "UK — London"],
                income_bands=[("owns P&L", (1000, 8000))],
                occupations=["VP of sales ops", "VP of customer experience", "supply chain director"],
                traits={"price_sensitivity": T(0.38, 0.12), "skepticism": T(0.62, 0.12),
                        "novelty_seeking": T(0.50, 0.12), "brand_trust": T(0.58, 0.12),
                        "social_influence": T(0.48, 0.12), "risk_tolerance": T(0.42, 0.12),
                        "privacy_sensitivity": T(0.55, 0.12)},
                familiarity=["medium", "medium", "high"],
                research_styles=["asks 'which of my peers deployed this and what moved'"],
                buying_triggers=["credible impact on their KPI this fiscal year",
                                 "pilot that IT and security won't block"],
                dealbreaker_pool=[DB["casestudy"], DB["proof"], DB["onboarding"],
                                  DB["integration"], DB["anothertool"], DB["aihype"]],
            ),
            SubSegmentSpec(
                name="Enterprise innovation team lead (budgeted experimenter)",
                weight=0.20,
                age_range=(28, 45),
                regions=["US — coastal metro", "Singapore", "UAE — Dubai"],
                income_bands=[("innovation budget", (500, 4000))],
                occupations=["innovation lead", "digital transformation manager", "enterprise architect"],
                traits={"price_sensitivity": T(0.35, 0.12), "skepticism": T(0.55, 0.12),
                        "novelty_seeking": T(0.78, 0.10), "brand_trust": T(0.50, 0.12),
                        "social_influence": T(0.55, 0.12), "risk_tolerance": T(0.60, 0.12),
                        "privacy_sensitivity": T(0.58, 0.12)},
                familiarity=["high", "high", "medium"],
                research_styles=["runs structured pilots; needs a measurable before/after"],
                buying_triggers=["novel capability they can demo to leadership",
                                 "vendor collaborative enough to co-build a pilot"],
                dealbreaker_pool=[DB["aihype"], DB["proof"], DB["security"],
                                  DB["vendorlock"], DB["onboarding"]],
            ),
        ],
    ),
    # ---------------------------------------------------------------- Budget-conscious
    "budget": PresetSpec(
        key="budget",
        id_prefix="BUDGET",
        label="Budget-conscious consumers",
        sub_segments=[
            SubSegmentSpec(
                name="Deal hunter who compares everything",
                weight=0.30,
                age_range=(22, 55),
                regions=["US — Midwest city", "US — Southeast metro", "UK city", "Canada city"],
                income_bands=[("stretched but online-savvy", (10, 50))],
                occupations=["retail worker", "call center agent", "driver", "warehouse associate"],
                traits={"price_sensitivity": T(0.90, 0.06), "skepticism": T(0.72, 0.10),
                        "novelty_seeking": T(0.40, 0.14), "brand_trust": T(0.38, 0.12),
                        "social_influence": T(0.55, 0.12), "risk_tolerance": T(0.32, 0.10),
                        "privacy_sensitivity": T(0.50, 0.14)},
                familiarity=["low", "medium", "medium"],
                research_styles=["opens 6 tabs, sorts by price, searches '<product> free alternative'"],
                buying_triggers=["a genuine discount or a free tier that isn't crippled"],
                dealbreaker_pool=[DB["pricing"], DB["hiddenfees"], DB["card"], DB["cancel"],
                                  DB["lockin"], DB["trial"]],
            ),
            SubSegmentSpec(
                name="Fixed-income household planner",
                weight=0.25,
                age_range=(35, 70),
                regions=["US — rural", "US — Rust Belt", "UK town"],
                income_bands=[("fixed monthly budget", (5, 35))],
                occupations=["retiree", "disability benefits", "part-time worker"],
                traits={"price_sensitivity": T(0.92, 0.05), "skepticism": T(0.75, 0.10),
                        "novelty_seeking": T(0.22, 0.10), "brand_trust": T(0.48, 0.14),
                        "social_influence": T(0.40, 0.12), "risk_tolerance": T(0.18, 0.08),
                        "privacy_sensitivity": T(0.66, 0.12)},
                familiarity=["low", "low", "medium"],
                research_styles=["asks a trusted family member; distrusts anything pushy"],
                buying_triggers=["a person they trust vouches for it; no surprises on the bill"],
                dealbreaker_pool=[DB["lockin"], DB["hiddenfees"], DB["cancel"], DB["card"],
                                  DB["support"], DB["privacy"]],
            ),
            SubSegmentSpec(
                name="Young renter optimizing every subscription",
                weight=0.25,
                age_range=(21, 32),
                regions=["US — coastal metro", "US — Sun Belt metro", "UK city"],
                income_bands=[("rent eats the paycheck", (10, 45))],
                occupations=["barista", "junior admin", "grad student", "server"],
                traits={"price_sensitivity": T(0.84, 0.08), "skepticism": T(0.64, 0.12),
                        "novelty_seeking": T(0.55, 0.14), "brand_trust": T(0.40, 0.12),
                        "social_influence": T(0.66, 0.12), "risk_tolerance": T(0.40, 0.12),
                        "privacy_sensitivity": T(0.48, 0.14)},
                familiarity=["medium", "medium", "high"],
                research_styles=["does a monthly 'cancel audit'; new subs must beat an old one"],
                buying_triggers=["replaces something more expensive they already pay for"],
                dealbreaker_pool=[DB["lockin"], DB["pricing"], DB["cancel"], DB["overkill"],
                                  DB["hiddenfees"], DB["trial"]],
            ),
            SubSegmentSpec(
                name="Cashback / coupon power user",
                weight=0.20,
                age_range=(25, 50),
                regions=["US — suburb", "Canada suburb", "UK suburb"],
                income_bands=[("middle income, maximizer mindset", (15, 70))],
                occupations=["teacher", "bookkeeper", "nurse", "logistics coordinator"],
                traits={"price_sensitivity": T(0.82, 0.08), "skepticism": T(0.60, 0.12),
                        "novelty_seeking": T(0.45, 0.12), "brand_trust": T(0.50, 0.12),
                        "social_influence": T(0.58, 0.12), "risk_tolerance": T(0.35, 0.10),
                        "privacy_sensitivity": T(0.45, 0.14)},
                familiarity=["medium", "medium", "high"],
                research_styles=["checks deal forums and waits for a promo before committing"],
                buying_triggers=["stacked discount, referral bonus, or annual-plan math that works"],
                dealbreaker_pool=[DB["pricing"], DB["hiddenfees"], DB["trial"], DB["reviews"],
                                  DB["cancel"]],
            ),
        ],
    ),
    # ---------------------------------------------------------------- Early adopters
    "early_adopters": PresetSpec(
        key="early_adopters",
        id_prefix="EARLY",
        label="Early adopters",
        sub_segments=[
            SubSegmentSpec(
                name="Indie hacker / developer early adopter",
                weight=0.30,
                age_range=(22, 40),
                regions=["US — remote", "EU — Berlin", "India — Bangalore", "Vietnam — HCMC"],
                income_bands=[("spends on tools that ship faster", (30, 200))],
                occupations=["indie hacker", "senior developer", "devops engineer", "ML engineer"],
                traits={"price_sensitivity": T(0.52, 0.14), "skepticism": T(0.72, 0.10),
                        "novelty_seeking": T(0.85, 0.08), "brand_trust": T(0.40, 0.12),
                        "social_influence": T(0.55, 0.12), "risk_tolerance": T(0.70, 0.10),
                        "privacy_sensitivity": T(0.55, 0.14)},
                familiarity=["high", "high", "high"],
                research_styles=["reads the docs and HN comments before the landing page"],
                buying_triggers=["genuinely novel capability + transparent architecture",
                                 "generous free tier and an API"],
                dealbreaker_pool=[DB["aihype"], DB["proof"], DB["vendorlock"], DB["pricing"],
                                  DB["onboarding"], DB["corporate"]],
            ),
            SubSegmentSpec(
                name="Productivity system tinkerer",
                weight=0.25,
                age_range=(20, 42),
                regions=["US — coastal metro", "UK — London", "remote worldwide"],
                income_bands=[("pays for 9 tools already", (25, 120))],
                occupations=["product manager", "consultant", "PhD student", "designer"],
                traits={"price_sensitivity": T(0.55, 0.14), "skepticism": T(0.58, 0.12),
                        "novelty_seeking": T(0.80, 0.10), "brand_trust": T(0.48, 0.12),
                        "social_influence": T(0.68, 0.12), "risk_tolerance": T(0.60, 0.12),
                        "privacy_sensitivity": T(0.50, 0.14)},
                familiarity=["high", "high", "medium"],
                research_styles=["watches a 20-min YouTube deep-dive, imports their whole workflow to test"],
                buying_triggers=["a workflow their current stack can't replicate",
                                 "beautiful craft — they pay for polish"],
                dealbreaker_pool=[DB["time"], DB["lockin"], DB["mobile"], DB["aihype"],
                                  DB["pricing"], DB["anothertool"]],
            ),
            SubSegmentSpec(
                name="AI power user / prompt tinkerer",
                weight=0.25,
                age_range=(19, 45),
                regions=["US — remote", "SEA — Singapore", "EU — Amsterdam"],
                income_bands=[("already pays for 2-3 AI subs", (30, 150))],
                occupations=["analyst", "founder", "marketer", "researcher"],
                traits={"price_sensitivity": T(0.50, 0.14), "skepticism": T(0.66, 0.12),
                        "novelty_seeking": T(0.88, 0.07), "brand_trust": T(0.42, 0.12),
                        "social_influence": T(0.62, 0.12), "risk_tolerance": T(0.68, 0.10),
                        "privacy_sensitivity": T(0.52, 0.14)},
                familiarity=["high", "high", "high"],
                research_styles=["stress-tests the demo with edge cases in the first 5 minutes"],
                buying_triggers=["beats their current AI workflow on a real task, measurably"],
                dealbreaker_pool=[DB["aihype"], DB["proof"], DB["pricing"], DB["privacy"],
                                  DB["overkill"]],
            ),
            SubSegmentSpec(
                name="Gadget & beta enthusiast",
                weight=0.20,
                age_range=(18, 38),
                regions=["US — Sun Belt metro", "Japan — Tokyo", "Korea — Seoul", "UK city"],
                income_bands=[("discretionary gadget budget", (20, 100))],
                occupations=["QA engineer", "student", "sales engineer", "photographer"],
                traits={"price_sensitivity": T(0.58, 0.14), "skepticism": T(0.45, 0.14),
                        "novelty_seeking": T(0.90, 0.06), "brand_trust": T(0.50, 0.12),
                        "social_influence": T(0.72, 0.10), "risk_tolerance": T(0.72, 0.10),
                        "privacy_sensitivity": T(0.38, 0.14)},
                familiarity=["medium", "high", "high"],
                research_styles=["joins the waitlist first, asks questions later"],
                buying_triggers=["being first among friends to try it"],
                dealbreaker_pool=[DB["time"], DB["reviews"], DB["pricing"], DB["mobile"],
                                  DB["cancel"]],
            ),
        ],
    ),
}


# ------------------------------------------------------------------ custom preset
# Heuristic: start from a neutral base population, then shift trait means with
# keyword signals from the user's description. Documented, deterministic, and
# honest about being a heuristic (the diversity validator still applies).

_CUSTOM_MODIFIERS: list[tuple[set[str], dict[str, float]]] = [
    ({"developer", "engineer", "technical", "devs", "programmer"},
     {"novelty_seeking": +0.15, "skepticism": +0.10, "brand_trust": -0.05}),
    ({"enterprise", "compliance", "regulated", "bank", "insurance", "government"},
     {"privacy_sensitivity": +0.20, "risk_tolerance": -0.15, "skepticism": +0.10}),
    ({"student", "students", "budget", "cheap", "affordable", "low-income"},
     {"price_sensitivity": +0.20, "brand_trust": -0.05}),
    ({"parent", "parents", "family", "kids", "children", "mom", "dad"},
     {"risk_tolerance": -0.10, "privacy_sensitivity": +0.10, "social_influence": +0.05}),
    ({"luxury", "premium", "executive", "affluent", "high-end"},
     {"price_sensitivity": -0.20, "brand_trust": +0.10}),
    ({"crypto", "web3", "gamer", "gaming", "beta", "early"},
     {"novelty_seeking": +0.20, "risk_tolerance": +0.15}),
    ({"senior", "elderly", "retired", "older"},
     {"novelty_seeking": -0.15, "skepticism": +0.05, "price_sensitivity": +0.05}),
    ({"privacy", "secure", "security", "anonymous"},
     {"privacy_sensitivity": +0.20}),
]

_REGION_HINTS: list[tuple[set[str], list[str]]] = [
    ({"vietnam", "vietnamese", "hanoi", "saigon", "hcmc"}, ["Vietnam urban", "Vietnam provincial"]),
    ({"sea", "southeast", "asean", "indonesia", "philippines", "thailand", "malaysia"},
     ["Indonesia urban", "Philippines urban", "Thailand urban", "Vietnam urban"]),
    ({"india", "indian"}, ["India — tier-1 city", "India — tier-2 city"]),
    ({"europe", "european", "eu", "germany", "france", "uk"}, ["EU — metro", "UK city"]),
    ({"latam", "brazil", "mexico"}, ["Brazil — metro", "Mexico — metro"]),
    ({"us", "usa", "american", "america"}, ["US — coastal metro", "US — Midwest city", "US — Sun Belt metro"]),
]

_BASE_TRAITS: dict[str, Trait] = {
    "price_sensitivity": T(0.60, 0.15), "skepticism": T(0.60, 0.14),
    "novelty_seeking": T(0.55, 0.15), "brand_trust": T(0.48, 0.13),
    "social_influence": T(0.55, 0.14), "risk_tolerance": T(0.45, 0.14),
    "privacy_sensitivity": T(0.55, 0.14),
}


def build_custom_preset(description: str) -> PresetSpec:
    from ...utils.text import tokenize  # local import to avoid cycles

    words = set(tokenize(description))
    shifts: dict[str, float] = {}
    for keys, mods in _CUSTOM_MODIFIERS:
        if words & keys:
            for trait, delta in mods.items():
                shifts[trait] = shifts.get(trait, 0.0) + delta

    regions = ["US — metro", "EU — metro", "remote worldwide"]
    for keys, region_list in _REGION_HINTS:
        if words & keys:
            regions = region_list
            break

    def shifted(extra: dict[str, float]) -> dict[str, Trait]:
        out: dict[str, Trait] = {}
        for trait, (mean, std) in _BASE_TRAITS.items():
            m = mean + shifts.get(trait, 0.0) + extra.get(trait, 0.0)
            out[trait] = (max(0.05, min(0.95, m)), std)
        return out

    label = description.strip()[:60]
    generic_db = [DB["pricing"], DB["proof"], DB["lockin"], DB["trial"], DB["hiddenfees"],
                  DB["privacy"], DB["onboarding"], DB["reviews"], DB["aihype"], DB["support"]]

    # Three sub-populations: mainstream core + skeptical fringe + enthusiast
    # fringe. Real markets are never one homogeneous blob, and this guarantees
    # segment variance even for custom descriptions.
    subs = [
        SubSegmentSpec(
            name=f"{label} — mainstream", weight=0.6, age_range=(22, 55),
            regions=regions,
            income_bands=[("typical for segment", (20, 150))],
            occupations=["professional", "self-employed", "manager", "specialist"],
            traits=shifted({}),
            familiarity=["low", "medium", "medium", "high"],
            research_styles=["compares a few options and reads recent reviews"],
            buying_triggers=["clear value for their specific situation"],
            dealbreaker_pool=generic_db,
        ),
        SubSegmentSpec(
            name=f"{label} — skeptical holdout", weight=0.25, age_range=(28, 60),
            regions=regions,
            income_bands=[("cautious spender", (10, 80))],
            occupations=["professional", "operations", "finance-minded"],
            traits=shifted({"skepticism": +0.18, "risk_tolerance": -0.12, "novelty_seeking": -0.10}),
            familiarity=["low", "low", "medium"],
            research_styles=["needs proof and a trusted referral before trying anything"],
            buying_triggers=["undeniable evidence plus a risk-free exit"],
            dealbreaker_pool=generic_db,
        ),
        SubSegmentSpec(
            name=f"{label} — enthusiast", weight=0.15, age_range=(18, 45),
            regions=regions,
            income_bands=[("spends on their interests", (30, 200))],
            occupations=["hobbyist-expert", "creator", "power user"],
            traits=shifted({"novelty_seeking": +0.20, "risk_tolerance": +0.15, "skepticism": -0.08}),
            familiarity=["medium", "high", "high"],
            research_styles=["tries new things in this category the week they launch"],
            buying_triggers=["novelty plus bragging rights in their community"],
            dealbreaker_pool=generic_db,
        ),
    ]
    return PresetSpec(key="custom", id_prefix="CUSTOM", label=label or "Custom segment",
                      sub_segments=subs)


def resolve_preset(key: str, custom_description: str | None = None) -> PresetSpec:
    if key == "custom":
        return build_custom_preset(custom_description or "custom segment")
    if key not in PRESETS:
        raise KeyError(f"Unknown target market preset: {key}")
    return PRESETS[key]
