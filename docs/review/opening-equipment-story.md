# The opening equipment trail

Both faction choices still enter The Great Recall through their existing campaign
IDs and route revisions. The suggested opening now follows the first three main
contracts. Optional surveys remain available and do not dismiss the guide.

| Route | First contract | Refit for the second | Third-contract choice |
|---|---|---|---|
| Linewrought | Free Iona Venn's Marker Eleven registry; its cabinet supplies a Focused Medium Laser after victory. | Replace a Gadfly's left-arm Flamer with the one-tonne, one-box optic; save **Lamplighter**. Cover Nera Pell's Cut Nine winch from farther back while another machine protects the cradle. | Defend Pell's home at Sarn Gantry Three. The original four total the 205-tonne limit. Quiet Claim's existing Prybar hulk supplies a lighter alternative once rebuilt, armed and assigned a pilot. Choose who holds the gantry and who takes the optional stores. |
| Aurelian Stock | Recover quartermaster Ada Rusk's service cart by clearing Apron Seven; receive its Focused Large Laser under a custody receipt. | Replace one Halberd Large Laser with the five-tonne, two-box optic; save **Long Watch**. Support the approach to Len Saye's custody posts, accepting hotter shots and a slower cycle for extra reach. | Protect Saye's originals at Sarn Registry Court with 175 tonnes. Choose a heavy firing line or retain the Votive's mobility and sensors; all four opening machines cannot deploy together. |

These are suggested refits. No mission requires a specific weapon, variant name
or surviving pilot. The actual enemy encounters, route positions, capture and
hold objectives remain available to other configurations and tactics.

## Rewards and compatibility

The first rewards use the existing objective-gated contract-goods system:
`marker_eleven_optic` requires `copy_title_rolls`; `apron_seven_optic` requires
`clear_tender_approach`. Both also require mission victory and a deployed
participant. Their named source is preserved in the reward receipt, while the
item enters the ordinary weapon inventory. No new weapon type or instance system
was introduced. Enemy salvage remains a separate chance- and contract-dependent
claim, including when the player negotiates away field salvage.

Existing saves retain their route revisions, IDs, company inventory and named
builds. Completed first contracts do not retroactively receive or duplicate the
new equipment. The bay keeps using existing fitting, naming and save mechanisms.
The optional survey and resupply paths remain intact.

## Gameplay scope and evidence

The only battle-configuration change is `switchyard_watch`: its mission tonnage
falls from 220 to 175, and the authored reference lance omits the Votive to field
a legal 170-tonne trio. Player campaigns can choose any legal team. No opponent,
weapon, objective timer, support budget or map geometry was retuned. All other
mission changes are prose and displayed place names.

A measured 32-battle check used the four possible opening Aurelian trios, eight
seeds each. The 170-, 160-, 155- and 130-tonne choices each completed the registry
mission 8/8 times, without a timeout. This establishes viable choices for the
opening; it does not establish equal combat efficiency.

The equipment-loop test starts without the demo crate, wins the actual first
mission, receives the authored item, makes the proposed legal swap, names it,
saves and loads it, then deploys and fires it during the next successful mission.
The Linewrought rescue uses explicit winch/guard orders, exercising the stated
tactical problem instead of assuming an AI pursuit order protects the cradle.
Additional checks retain established-save claims, reject the four-mech Aurelian
manifest, and admit each opening trio.

The focused campaign, schema and opening-guide suite passes 524 tests across
72 files. Supporting experiment output is in `reports/opening-story/`. Full balance,
campaign acceptance and browser gates belong to the enclosing build review.
