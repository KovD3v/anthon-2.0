# Contextual emoji intensity

## Goal

Make Anthon's emoji behavior closer to the observed coach conversations:
emoji have a selective but clearly perceptible presence and become fully
expressive when the emotional moment calls for them.

## Evidence and interpretation

Across the two supplied conversations, 98 of 2,043 written coach messages
contain emoji (4.8%). Those messages contain 204 emoji in total, or 2.08 emoji
per emoji-bearing message. The dominant families are `💪🏻`, `❤️`, `💥`, `🔥`,
`🎯`, `🤣`, and `😂`.

The 4.8% message rate must not become a literal runtime probability. The coach
often sends several small messages in one conversational burst, while Anthon
normally produces one assistant response. A fixed random quota would also put
emoji into emotionally inappropriate turns. The runtime rule is therefore
contextual. As a calibration target rather than a random quota, emoji should be
perceptible in roughly one out of every six to eight Anthon responses across a
representative coaching conversation. Marked moments may use a small cluster.

## Behavior

- Use no emoji for ordinary, sober, explanatory, or operational turns, but do
  not suppress them when encouragement, energy, affection, achievement, focus,
  or complicity is genuinely present.
- Use emoji only when they match a real emotional function:
  - `💪🏻` for encouragement, resilience, and forward movement;
  - `❤️` for authentic connection and meaningful personal moments;
  - `💥` for a breakthrough, result, or strong performance;
  - `🔥` for intensity, momentum, and positive energy;
  - `🎯` for focus, direction, and an achieved objective;
  - `🤣` or `😂` only when genuine playfulness is already present.
- When an emoji is warranted, allow two or three, including repeated forms such
  as `💪🏻💪🏻`, `🔥🔥`, or `🎯🎯🎯`.
- Reserve longer clusters for exceptional celebrations. Do not make them a
  normal closing signature.
- Consecutive emoji-bearing replies are allowed only when the same marked
  emotional moment continues. They are not forbidden mechanically.
- Never add decorative emoji headings, emoji-led lists, or random variety.
- Keep emoji choice subordinate to the situational coaching move; emoji express
  the response rather than determine it.

## Runtime scope

Update the shared conversational-voice prompt so the rule reaches full, guest,
and compact coaching prompts through their existing shared composition. Keep
the light social prompt concise and compatible with the same
selective-but-expressive principle. Treat one response in six to eight as a
calibration target, not a per-message command. Do not introduce counters,
persistent cadence state, random sampling, schema changes, or model-routing
changes.

## Verification

Prompt regression tests must prove that:

1. ordinary responses still default to no emoji;
2. marked moments may use two or three contextual emoji;
3. the prompt contains the observed semantic palette;
4. the old hard limits of at most one emoji and no consecutive emoji-bearing
   replies are absent;
5. decorative lists and indiscriminate use remain prohibited;
6. the shared prompt is still present in authenticated and guest runtime paths.

Run the focused communication-style and orchestrator tests, scoped Biome,
typecheck, and the full unit suite before publication.
