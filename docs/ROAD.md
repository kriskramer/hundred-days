# Plan: RoadScreen — Accumulating Journal Panel

## Context

The current RoadScreen toggles between two views: a "LAST ENTRY" journal panel and a "location" panel. Every action the player takes causes the screen to flip to the journal view and back, fragmenting the day's events. The goal is a single, persistent, scrollable journal panel that accumulates all of the day's events in order — location description, random text, NPC cue, and each action result appended below — so that a full day of activity reads like a living journal entry. Additionally, trade and combat interactions need richer flavor text (merchant greetings, enemy encounter descriptions).

---

## Files Modified

- `src/screens/RoadScreen.tsx` — primary refactor
- `src/utils/tradeJournal.ts` — add `getMerchantEntryNarrative`
- `src/__tests__/utils/tradeJournal.test.ts` — add test for new function

---

## Step 1 — Enrich `src/utils/tradeJournal.ts`

Add `getMerchantEntryNarrative(shopName)` alongside the existing `getShopEntryNarrative` (which stays for backward compat with existing tests):

```typescript
const MERCHANT_GREETINGS = [
  'nods as you enter, hands folded on the counter',
  "looks up from their ledger with a merchant's eye",
  'greets you with a practiced smile',
  'sizes you up with a glance and waits',
  'is arranging stock but turns to face you',
];

export function getMerchantEntryNarrative(shopName: string): string {
  const greeting = MERCHANT_GREETINGS[Math.floor(Math.random() * MERCHANT_GREETINGS.length)];
  return `You enter ${shopName}. The merchant ${greeting}. "What can I do for you?"`;
}
```

Add test in `tradeJournal.test.ts`: assert the result is a string containing the shop name.

---

## Step 2 — New state model (replace 5 boolean flags)

**Remove** from RoadScreen local state:
- `showingLastEntry`, `forceComplete`, `lastEntryFinished`, `locDescFinished`, `randomTextFinished`, `pendingShopName`

**Add** (define `JournalSegment` at module scope above the component):

```typescript
interface JournalSegment {
  key:          string;
  type:         'prev_entry' | 'prev_delta' | 'loc_desc' | 'random_text' | 'npc_cue'
                | 'action_result' | 'combat_intro' | 'trade_intro';
  text?:        string;
  deltaFood?:   number;
  deltaGold?:   number;
  deltaHealth?: number;
  deltaMorale?: number;
  instant:      boolean;   // true = skip typewriter
}

const [segments, setSegments]           = useState<JournalSegment[]>([]);
const [completedKeys, setCompletedKeys] = useState<Set<string>>(new Set());
const [forceComplete, setForceComplete] = useState(false);
const journalScrollRef = useRef<ScrollView>(null);
```

---

## Step 3 — Derived `isTyping` + `typingKey`

Replace the old `isJournalEntryTyping/isLocationTyping/isTyping` logic with:

```typescript
const firstTypingIdx = segments.findIndex(
  (s, i) =>
    !s.instant &&
    !completedKeys.has(s.key) &&
    segments.slice(0, i).filter(p => !p.instant).every(p => completedKeys.has(p.key))
);
const isTyping  = firstTypingIdx !== -1;
const typingKey = isTyping ? segments[firstTypingIdx].key : null;
```

Remove the `showingLastEntry` guard from `showAlertBadges`:
```typescript
const showAlertBadges = dangerNearby || dialogueNearby || bossNearby;
```

Remove derived text composition variables (`displayLocationText`, `displayRandomText`, `locationNarrativeText`, `randomNarrativeText`, `shopEntryNarrative`). Keep `baseLocationText` and `randomText`.

---

## Step 4 — Three `useEffect` replacements

### Effect A — location arrival (reset panel)

Triggered only on `gameState.currentLocationId` change.

```typescript
useEffect(() => {
  const segs: JournalSegment[] = [];

  if (lastTurn) {
    segs.push({ key: `prev-entry-${lastTurn.dayNumber}-${lastTurn.action}`,
                type: 'prev_entry',
                text: lastTurn.narrativeSummary || 'The day passed without incident.',
                instant: true });
    if (hasDelta) {
      segs.push({ key: `prev-delta-${lastTurn.dayNumber}`,
                  type: 'prev_delta',
                  deltaFood: netFood, deltaGold: netGold,
                  deltaHealth: netHealth, deltaMorale: netMorale,
                  instant: true });
    }
  }

  if (baseLocationText)
    segs.push({ key: `loc-${gameState.currentLocationId}`, type: 'loc_desc',    text: baseLocationText, instant: false });
  if (randomText)
    segs.push({ key: `rnd-${gameState.currentLocationId}`, type: 'random_text', text: randomText,        instant: false });
  if (dialogueCue)
    segs.push({ key: `npc-${gameState.currentLocationId}`, type: 'npc_cue',     text: dialogueCue,       instant: false });

  setSegments(segs);
  setCompletedKeys(new Set());
  setForceComplete(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  // Intentionally snapshot lastTurn at arrival only; same-location actions are handled by Effect B
}, [gameState.currentLocationId]);
```

### Effect B — same-location action completion (append)

```typescript
useEffect(() => {
  if (!lastTurnKey || lastTurnKey === prevTurnKeyRef.current) return;
  prevTurnKeyRef.current = lastTurnKey;
  if (lastTurn?.locationAfter !== lastTurn?.locationBefore) return; // movement handled by Effect A

  const text = lastTurn?.narrativeSummary || 'The day continued.';
  setSegments(prev => [...prev, {
    key: `action-${lastTurnKey}`, type: 'action_result', text, instant: false,
  }]);
}, [lastTurnKey]);
```

### Effect C — auto-scroll on new segment

```typescript
useEffect(() => {
  if (segments.length > 0) {
    const t = setTimeout(() => journalScrollRef.current?.scrollToEnd({ animated: true }), 80);
    return () => clearTimeout(t);
  }
}, [segments]);
```

---

## Step 5 — Import updates

- Line 15: swap `getShopEntryNarrative` → `getMerchantEntryNarrative` from `@utils/tradeJournal`
- Line 13: add `getEnemyDefinition` to the `@engine` import (confirm it's exported from `src/engine/index.ts`)

---

## Step 6 — Update action button handlers

**Trade button** — replace `setPendingShopName(merchantName)` with:
```typescript
onPress: () => {
  const flavorText = getMerchantEntryNarrative(merchantName);
  setSegments(prev => [...prev, {
    key: `trade-${Date.now()}`, type: 'trade_intro', text: flavorText, instant: false,
  }]);
  // onOpenShop fires from the segment's onComplete callback (see Step 7)
}
```

**Combat / Fight Boss buttons** — prepend encounter flavor before opening:
```typescript
onPress: () => {
  const hostileMob = location.mobs.find(m => m.aggroPct > 0 && !m.isCompanion);
  let encounterText = 'Danger looms ahead.';
  if (hostileMob) {
    try {
      const def = getEnemyDefinition(hostileMob.enemyId); // verify field name vs types.ts
      if (def.encounterTexts?.length)
        encounterText = def.encounterTexts[Math.floor(Math.random() * def.encounterTexts.length)];
    } catch { /* fallback text */ }
  }
  setSegments(prev => [...prev, {
    key: `combat-${Date.now()}`, type: 'combat_intro', text: encounterText, instant: false,
  }]);
  // onOpenCombat fires from the segment's onComplete callback (see Step 7)
}
```

> **Note:** Verify the actual field name for enemy ID on the mob object (`enemyId` vs `mobId`) by checking `src/engine/types.ts` before coding.

---

## Step 7 — Rewrite the narrative panel (lines 463-538)

Replace the binary panel with a `ScrollView` + mapped `JournalSegmentView`:

```tsx
<ScrollView
  ref={journalScrollRef}
  style={{ maxHeight: 340 }}
  nestedScrollEnabled   // required for Android vertical nesting
  showsVerticalScrollIndicator={false}
>
  <TouchableOpacity
    activeOpacity={0.95}
    onPress={() => setForceComplete(true)}
    style={{ borderWidth: 1, borderColor: Colors.gold, borderRadius: 3,
             padding: 12, marginBottom: 12, backgroundColor: '#EDE4CF' }}
  >
    {segments.map((seg, i) => (
      <JournalSegmentView
        key={seg.key}
        seg={seg}
        isTyping={seg.key === typingKey}
        isCompleted={completedKeys.has(seg.key)}
        forceComplete={forceComplete && seg.key === typingKey}
        textInterval={textInterval}
        showDivider={i > 0}
        renderDelta={renderDelta}
        onComplete={() => {
          setCompletedKeys(prev => new Set([...prev, seg.key]));
          setForceComplete(false);
          if (seg.type === 'trade_intro')  setTimeout(() => onOpenShop?.(merchantName), 0);
          if (seg.type === 'combat_intro') setTimeout(() => onOpenCombat?.(), 0);
        }}
      />
    ))}
  </TouchableOpacity>
</ScrollView>
```

### `JournalSegmentView` sub-component (module scope, below existing sub-components)

```tsx
function JournalSegmentView({ seg, isTyping, isCompleted, forceComplete, textInterval,
                               showDivider, renderDelta, onComplete }: {
  seg: JournalSegment; isTyping: boolean; isCompleted: boolean; forceComplete: boolean;
  textInterval: number; showDivider: boolean;
  renderDelta: (val: number, label: string, icon: string) => React.ReactNode;
  onComplete: () => void;
}) {
  const isPrevEntry = seg.type === 'prev_entry';
  const textStyle = isPrevEntry
    ? { fontFamily: 'CrimsonText_400Regular_Italic', fontSize: 14, lineHeight: 21,
        color: Colors.mist, opacity: 0.8 }
    : { fontFamily: 'CrimsonText_400Regular_Italic', fontSize: 15, lineHeight: 22,
        color: Colors.inkLight };

  const HEADERS: Partial<Record<JournalSegment['type'], string>> = {
    prev_entry:    'PREVIOUS DAY',
    action_result: 'YOU ACTED',
    combat_intro:  'DANGER APPROACHES',
    trade_intro:   'AT THE MARKET',
  };
  const header = HEADERS[seg.type] ?? null;

  if (seg.type === 'prev_delta') {
    return (
      <>
        {showDivider && <Divider />}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {renderDelta(seg.deltaFood   ?? 0, 'food',   '🍎')}
          {renderDelta(seg.deltaGold   ?? 0, 'gold',   '🪙')}
          {renderDelta(seg.deltaHealth ?? 0, 'health', '❤️')}
          {renderDelta(seg.deltaMorale ?? 0, 'morale', '🎭')}
        </View>
      </>
    );
  }

  // Segments not yet reached in the typewriter chain are hidden
  if (!seg.instant && !isCompleted && !isTyping) return null;

  return (
    <>
      {showDivider && <Divider />}
      {header && (
        <Text style={{ fontFamily: 'Cinzel_600SemiBold', fontSize: 10, letterSpacing: 0.5,
                       color: isPrevEntry ? Colors.mist : Colors.blood,
                       opacity: isPrevEntry ? 0.7 : 1, marginBottom: 4 }}>
          {header}
        </Text>
      )}
      {seg.instant || isCompleted ? (
        <Text style={textStyle}>{seg.text}</Text>
      ) : (
        <TypewriterText
          key={seg.key}
          text={seg.text ?? ''}
          interval={textInterval}
          forceComplete={forceComplete}
          onComplete={onComplete}
          style={textStyle}
        />
      )}
    </>
  );
}

function Divider() {
  return <View style={{ height: 1, backgroundColor: '#C8A060', opacity: 0.4, marginVertical: 8 }} />;
}
```

---

## Step 8 — Actions section and fullscreen overlay

**Actions section:** Remove the `{!showingLastEntry && (` guard — actions are always rendered.

**Fullscreen overlay:** Replace the binary overlay with a single skip-typing version:
```tsx
{isTyping && !forceComplete && (
  <TouchableOpacity
    activeOpacity={1}
    onPress={() => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
      setForceComplete(true);
    }}
    style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }}
  />
)}
```

Remove the `showingLastEntry` dismiss overlay branch entirely.

---

## Step 9 — Cleanup

Confirm no remaining references to deleted variables:
`showingLastEntry`, `lastEntryFinished`, `locDescFinished`, `randomTextFinished`,
`pendingShopName`, `isJournalEntryTyping`, `isShopIntroTyping`, `isLocationTyping`,
`shopEntryNarrative`, `locationNarrativeText`, `randomNarrativeText`,
`displayLocationText`, `displayRandomText`, `handleShopIntroComplete`.

Run `npx tsc --noEmit` to confirm no type errors before testing.

---

## Verification

1. `npx expo start` — golden path:
   - New game → location description types out → random text types out → NPC cue types out → actions unlock
   - Tap panel during typing → fast-forwards the current segment; tap again → advances to next
   - Forage → result appends below with typewriter; both location text and forage result visible; can scroll
   - Rest or Rally in same location → another result appends below
   - Move → panel resets: movement summary shown instantly at top (subdued), new location types out
   - Trade → merchant flavor text types, then shop opens automatically when typing completes
   - Combat → encounter text types, then combat screen opens; returning shows combat result appended
2. Companion section still renders beneath the journal panel
3. Alert badges (DANGER, BOSS, STRANGER NEARBY) always visible in the location header
4. `npx vitest run src/__tests__/utils/tradeJournal.test.ts` passes
