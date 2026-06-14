import { act, render, fireEvent, waitFor } from '@testing-library/react-native';
import { Text, TouchableOpacity } from 'react-native';
import { RoadScreen } from '@screens/RoadScreen';
import { EventType, PlayerAction, ResolutionType, WeatherType } from '@engine/types';
import { TurnEngine } from '@engine/TurnEngine';
import { makeGameState } from '../__fixtures__/gameState';
import { getShopEntryNarrative, getTradePurchaseNarrative } from '@utils/tradeJournal';

jest.mock('@components', () => {
  const actual = jest.requireActual('@components');

  return {
    ...actual,
    CompanionDetailModal: () => null,
  };
});

describe('RoadScreen', () => {
  it('submits move actions immediately when the party has no food', async () => {
    const onToast = jest.fn();
    const gameState = makeGameState({
      currentLocationId: 27,
      resources: { food: 0, gold: 25, items: [], maxSlots: 8, equippedItems: {} },
    });
    const engine = new TurnEngine(gameState, () => undefined, () => undefined, () => undefined);
    const submitAction = jest.spyOn(engine, 'submitAction').mockResolvedValue(undefined);

    // textInterval={0} makes all typing segments complete instantly — no overlay needed
    const { UNSAFE_getAllByType } = render(
      <RoadScreen
        gameState={gameState}
        engine={engine}
        onToast={onToast}
        textInterval={0}
      />
    );

    const moveButton = await waitFor(() => {
      const button = UNSAFE_getAllByType(TouchableOpacity).find(candidate =>
        candidate.findAllByType(Text).some((textNode: { props: { children: unknown } }) => {
          const children = textNode.props.children;
          return children === 'Move'
            || (Array.isArray(children) && children.includes('Move'));
        })
      );

      expect(button).toBeDefined();
      expect(button?.props.disabled).toBeFalsy();
      return button!;
    });

    fireEvent.press(moveButton);

    await waitFor(() => {
      expect(submitAction).toHaveBeenCalledWith({ action: PlayerAction.Move, forcedMarch: false });
    });
    expect(onToast).toHaveBeenCalledWith(
      'Marching hungry — health and morale penalties will keep worsening until you find food.'
    );
  });

  it('opens the inn screen from Visit Inn even while journal text is still typing at Zilam', async () => {
    const onToast = jest.fn();
    const onOpenInn = jest.fn();
    const gameState = makeGameState({
      currentLocationId: 19,
      resources: { food: 5, gold: 25, items: [], maxSlots: 8, equippedItems: {} },
      turnHistory: [],
    });
    const engine = new TurnEngine(gameState, () => undefined, () => undefined, () => undefined);

    const { UNSAFE_getAllByType } = render(
      <RoadScreen
        gameState={gameState}
        engine={engine}
        onToast={onToast}
        onOpenInn={onOpenInn}
        textInterval={1000}
      />
    );

    const innButton = await waitFor(() => {
      const button = UNSAFE_getAllByType(TouchableOpacity).find(candidate =>
        candidate.findAllByType(Text).some((textNode: { props: { children: unknown } }) => {
          const children = textNode.props.children;
          return children === 'Visit Inn'
            || (Array.isArray(children) && children.includes('Visit Inn'));
        })
      );

      expect(button).toBeDefined();
      expect(button?.props.disabled).toBeFalsy();
      return button!;
    });

    fireEvent.press(innButton);

    await waitFor(() => {
      expect(onOpenInn).toHaveBeenCalled();
    });
  });

  it('shows previous day entry and alert badges when arriving at a new location', async () => {
    const onToast = jest.fn();

    // Start at location 26 with no history
    const gameState1 = makeGameState({
      currentLocationId: 26,
      resources: { food: 5, gold: 25, items: [], maxSlots: 8, equippedItems: {} },
      turnHistory: [],
    });

    const engine = new TurnEngine(gameState1, () => undefined, () => undefined, () => undefined);

    const { rerender, queryByText } = render(
      <RoadScreen
        gameState={gameState1}
        engine={engine}
        onToast={onToast}
        textInterval={0}
      />
    );

    // No previous day entry yet
    expect(queryByText('PREVIOUS DAY')).toBeNull();

    // Simulate a move: location changes from 26 to 27, history gains a move entry
    const gameState2 = {
      ...gameState1,
      currentLocationId: 27,
      runLayout: { npcSlots: [], roamingMerchants: [], activeShortcuts: [], eliteSpawns: [], activeDetours: [], sagaThreads: [] },
      turnHistory: [
        {
          dayNumber: 1,
          locationBefore: 26,
          locationAfter: 27,
          action: PlayerAction.Move,
          weather: WeatherType.Neutral,
          eventsTriggered: [],
          deltas: [],
          levelUpOccurred: false,
          narrativeSummary: 'Marched along the path.',
        },
      ],
    };

    rerender(
      <RoadScreen
        gameState={gameState2}
        engine={engine}
        onToast={onToast}
        textInterval={0}
      />
    );

    // Previous day entry should now appear in the journal panel
    await waitFor(() => {
      expect(queryByText('PREVIOUS DAY')).toBeTruthy();
    });

    // Alert badges appear only when the location actually has threats or NPCs
    expect(queryByText('⚔ DANGER')).toBeTruthy();
    expect(queryByText('◇ STRANGER NEARBY')).toBeNull();
  });

  it('does not show STRANGER NEARBY at Okuna when no NPC is present', async () => {
    const onToast = jest.fn();
    const gameState = makeGameState({
      currentLocationId: 1,
      resources: { food: 5, gold: 25, items: [], maxSlots: 8, equippedItems: {} },
      runLayout: { npcSlots: [], roamingMerchants: [], activeShortcuts: [], eliteSpawns: [], activeDetours: [], sagaThreads: [] },
    });
    const engine = new TurnEngine(gameState, () => undefined, () => undefined, () => undefined);

    const { queryByText } = render(
      <RoadScreen
        gameState={gameState}
        engine={engine}
        onToast={onToast}
        textInterval={0}
      />
    );

    await waitFor(() => {
      expect(queryByText(/You have arrived at Okuna\./)).toBeTruthy();
    });
    expect(queryByText('◇ STRANGER NEARBY')).toBeNull();
    expect(queryByText('NPC')).toBeNull();
  });

  it('renders stored travel dialogue as an on-the-road segment', async () => {
    const onToast = jest.fn();
    const gameState = makeGameState({
      currentLocationId: 27,
      resources: { food: 5, gold: 25, items: [], maxSlots: 8, equippedItems: {} },
      turnHistory: [
        {
          dayNumber: 1,
          locationBefore: 26,
          locationAfter: 27,
          action: PlayerAction.Move,
          weather: WeatherType.Neutral,
          eventsTriggered: [],
          deltas: [],
          travelDialogue: {
            id: 'companion_sage_late_road_01:sage_one',
            sourceId: 'companion_sage_late_road_01',
            speakerType: 'companion',
            speakerName: 'Ilya',
            speakerId: 'sage_one',
            text: 'Every league east strips away another illusion. I suppose that is its own kind of mercy.',
          },
          levelUpOccurred: false,
          narrativeSummary: 'The road stretches ahead.',
        },
      ],
    });

    const engine = new TurnEngine(gameState, () => undefined, () => undefined, () => undefined);
    const { queryByText } = render(
      <RoadScreen
        gameState={gameState}
        engine={engine}
        onToast={onToast}
        textInterval={0}
      />
    );

    await waitFor(() => {
      expect(queryByText('ON THE ROAD')).toBeTruthy();
    });
    expect(queryByText('Ilya: "Every league east strips away another illusion. I suppose that is its own kind of mercy."')).toBeTruthy();
  });

  it('types the shop entry line before opening the shop', async () => {
    jest.useFakeTimers();

    const onToast = jest.fn();
    const onOpenShop = jest.fn();
    const gameState = makeGameState({
      currentLocationId: 27,
      resources: { food: 5, gold: 25, items: [], maxSlots: 8, equippedItems: {} },
      turnHistory: [],
    });

    const engine = new TurnEngine(gameState, () => undefined, () => undefined, () => undefined);
    const { UNSAFE_getAllByType } = render(
      <RoadScreen
        gameState={gameState}
        engine={engine}
        onToast={onToast}
        onOpenShop={onOpenShop}
        textInterval={0}
      />
    );

    // With textInterval=0, all initial segments (loc_desc etc.) complete instantly
    const tradeButton = await waitFor(() => {
      const button = UNSAFE_getAllByType(TouchableOpacity).find(candidate =>
        candidate.findAllByType(Text).some((textNode: { props: { children: unknown } }) => {
          const children = textNode.props.children;
          return children === 'Trade'
            || (Array.isArray(children) && children.includes('Trade'));
        })
      );

      expect(button).toBeDefined();
      expect(button?.props.disabled).toBeFalsy();
      return button!;
    });

    fireEvent.press(tradeButton);
    // onOpenShop should not fire immediately — it fires when the trade_intro segment finishes typing
    expect(onOpenShop).not.toHaveBeenCalled();

    // Advance timers: trade_intro types (interval=0 so immediate), then the setTimeout(...,0)
    // in onComplete fires onOpenShop
    act(() => {
      jest.runAllTimers();
    });

    expect(onOpenShop).toHaveBeenCalledWith('The Sdrakam Armory', expect.any(String));
    jest.useRealTimers();
  });

  it('does not auto-show the journal overlay for a trade entry', () => {
    const onToast = jest.fn();
    const gameState1 = makeGameState({
      currentLocationId: 27,
      resources: { food: 5, gold: 25, items: [], maxSlots: 8, equippedItems: {} },
      turnHistory: [],
    });

    const engine = new TurnEngine(gameState1, () => undefined, () => undefined, () => undefined);
    const { rerender, queryByText } = render(
      <RoadScreen
        gameState={gameState1}
        engine={engine}
        onToast={onToast}
        textInterval={0}
      />
    );

    const gameState2 = {
      ...gameState1,
      turnHistory: [
        {
          dayNumber: 1,
          locationBefore: 27,
          locationAfter: 27,
          action: PlayerAction.Trade,
          weather: WeatherType.Neutral,
          eventsTriggered: [],
          deltas: [],
          levelUpOccurred: false,
          narrativeSummary: getShopEntryNarrative('The Sdrakam Armory'),
        },
      ],
    };

    rerender(
      <RoadScreen
        gameState={gameState2}
        engine={engine}
        onToast={onToast}
        textInterval={0}
      />
    );

    expect(queryByText('LAST ENTRY — DAY 1')).toBeNull();
    expect(queryByText('Trade')).toBeTruthy();
  });

  it('updates the latest trade journal text when a purchase line is added', async () => {
    const onToast = jest.fn();
    const gameState1 = makeGameState({
      currentLocationId: 27,
      resources: { food: 5, gold: 25, items: [], maxSlots: 8, equippedItems: {} },
      turnHistory: [],
    });

    const engine = new TurnEngine(gameState1, () => undefined, () => undefined, () => undefined);
    const { rerender, getByText } = render(
      <RoadScreen
        gameState={gameState1}
        engine={engine}
        onToast={onToast}
        textInterval={0}
      />
    );

    const baseTradeRecord = {
      dayNumber: 1,
      locationBefore: 27,
      locationAfter: 27,
      action: PlayerAction.Trade,
      weather: WeatherType.Neutral,
      eventsTriggered: [],
      deltas: [],
      levelUpOccurred: false,
      narrativeSummary: getShopEntryNarrative('The Sdrakam Armory'),
    };

    rerender(
      <RoadScreen
        gameState={{ ...gameState1, turnHistory: [baseTradeRecord] }}
        engine={engine}
        onToast={onToast}
        textInterval={0}
      />
    );

    const purchaseLine = getTradePurchaseNarrative('Traveler\'s Blade', 25, true);

    rerender(
      <RoadScreen
        gameState={{
          ...gameState1,
          turnHistory: [{
            ...baseTradeRecord,
            narrativeSummary: `${baseTradeRecord.narrativeSummary}\n${purchaseLine}`,
          }],
        }}
        engine={engine}
        onToast={onToast}
        textInterval={0}
      />
    );

    await waitFor(() => {
      expect(getByText(/You purchased Traveler's Blade for 25 gold and equipped it\./)).toBeTruthy();
    });
  });

  it('removes stale combat intro text after the location is cleared', async () => {
    jest.useFakeTimers();

    const onToast = jest.fn();
    const onOpenCombat = jest.fn();
    const gameState1 = makeGameState({
      currentLocationId: 8,
      resources: { food: 5, gold: 25, items: [], maxSlots: 8, equippedItems: {} },
      clearedCombatLocations: new Set(),
      turnHistory: [],
    });

    const engine = new TurnEngine(gameState1, () => undefined, () => undefined, () => undefined);
    const { rerender, queryByText, UNSAFE_getAllByType } = render(
      <RoadScreen
        gameState={gameState1}
        engine={engine}
        onToast={onToast}
        onOpenCombat={onOpenCombat}
        textInterval={0}
      />
    );

    const combatButton = await waitFor(() => {
      const button = UNSAFE_getAllByType(TouchableOpacity).find(candidate =>
        candidate.findAllByType(Text).some((textNode: { props: { children: unknown } }) => {
          const children = textNode.props.children;
          return children === 'Combat'
            || (Array.isArray(children) && children.includes('Combat'));
        })
      );

      expect(button).toBeDefined();
      if (!button) {
        throw new Error('Expected combat button to be present.');
      }
      return button;
    });

    fireEvent.press(combatButton);

    act(() => {
      jest.runAllTimers();
    });

    await waitFor(() => {
      expect(queryByText('DANGER APPROACHES')).toBeTruthy();
    });

    rerender(
      <RoadScreen
        gameState={{ ...gameState1, clearedCombatLocations: new Set([8]) }}
        engine={engine}
        onToast={onToast}
        onOpenCombat={onOpenCombat}
        textInterval={0}
      />
    );

    await waitFor(() => {
      expect(queryByText('DANGER APPROACHES')).toBeNull();
      expect(queryByText('Combat')).toBeNull();
    });

    jest.useRealTimers();
  });

  it('hides Forage and Make Camp buttons in a town location, but shows them in a wilderness location', async () => {
    const onToast = jest.fn();
    
    // Test case 1: In a town location (location 27 - Sdrakam)
    const townGameState = makeGameState({
      currentLocationId: 27,
      resources: { food: 5, gold: 25, items: [], maxSlots: 8, equippedItems: {} },
    });
    const townEngine = new TurnEngine(townGameState, () => undefined, () => undefined, () => undefined);

    const { queryByText, rerender } = render(
      <RoadScreen
        gameState={townGameState}
        engine={townEngine}
        onToast={onToast}
        textInterval={0}
      />
    );

    expect(queryByText('Forage')).toBeNull();
    expect(queryByText('Make Camp')).toBeNull();
    expect(queryByText('Visit Inn')).toBeTruthy();

    // Test case 2: In a wilderness location (location 3 - Osiran Fields)
    const wildGameState = makeGameState({
      currentLocationId: 3,
      resources: { food: 5, gold: 25, items: [], maxSlots: 8, equippedItems: {} },
    });
    const wildEngine = new TurnEngine(wildGameState, () => undefined, () => undefined, () => undefined);

    rerender(
      <RoadScreen
        gameState={wildGameState}
        engine={wildEngine}
        onToast={onToast}
        textInterval={0}
      />
    );

    expect(queryByText('Forage')).toBeTruthy();
    expect(queryByText('Make Camp')).toBeTruthy();
    expect(queryByText('Visit Inn')).toBeNull();
  });

  it('renders individual NPC buttons instead of a generic Talk button', async () => {
    const onToast = jest.fn();
    const onOpenNpc = jest.fn();
    
    const gameState = makeGameState({
      currentLocationId: 2,
      resources: { food: 5, gold: 25, items: [], maxSlots: 8, equippedItems: {} },
    });
    const engine = new TurnEngine(gameState, () => undefined, () => undefined, () => undefined);

    const { queryByText } = render(
      <RoadScreen
        gameState={gameState}
        engine={engine}
        onToast={onToast}
        onOpenNpc={onOpenNpc}
        textInterval={0}
      />
    );

    await waitFor(() => {
      expect(queryByText('Rex')).toBeTruthy();
      expect(queryByText('Start dialogue')).toBeNull();
    });
  });

  it('resets the journal after a same-location day-pass action like forage', async () => {
    const onToast = jest.fn();
    const forageNarrative = 'You spend the day foraging. Net food gain: 1.5.';

    const gameState1 = makeGameState({
      currentLocationId: 3,
      dayNumber: 1,
      resources: { food: 5, gold: 25, items: [], maxSlots: 8, equippedItems: {} },
      turnHistory: [],
    });

    const engine = new TurnEngine(gameState1, () => undefined, () => undefined, () => undefined);
    const { rerender, queryByText, getByText } = render(
      <RoadScreen
        gameState={gameState1}
        engine={engine}
        onToast={onToast}
        textInterval={0}
      />
    );

    await waitFor(() => {
      expect(queryByText(/You have arrived at Osiran Fields\./)).toBeTruthy();
    });
    expect(queryByText('PREVIOUS DAY')).toBeNull();

    const gameState2 = {
      ...gameState1,
      dayNumber: 2,
      turnHistory: [
        {
          dayNumber: 1,
          locationBefore: 3,
          locationAfter: 3,
          action: PlayerAction.Hunt,
          weather: WeatherType.Neutral,
          eventsTriggered: [],
          deltas: [{ source: 'hunt', food: 1.5, narrative: forageNarrative }],
          levelUpOccurred: false,
          narrativeSummary: forageNarrative,
        },
      ],
    };

    rerender(
      <RoadScreen
        gameState={gameState2}
        engine={engine}
        onToast={onToast}
        textInterval={0}
      />
    );

    await waitFor(() => {
      expect(getByText('PREVIOUS DAY')).toBeTruthy();
      expect(getByText(forageNarrative)).toBeTruthy();
      expect(queryByText(/You have arrived at Osiran Fields\./)).toBeTruthy();
    });
  });

  it('shows event-driven town dialogue as an NPC button instead of auto-opening', async () => {
    const onToast = jest.fn();
    const onOpenNpc = jest.fn();
    const gameState = makeGameState({
      currentLocationId: 4,
      resources: { food: 5, gold: 25, items: [], maxSlots: 8, equippedItems: {} },
    });
    const engine = new TurnEngine(gameState, () => undefined, () => undefined, () => undefined);
    const activeEvent = {
      id: 'rumor_mill_town',
      type: EventType.Dialogue,
      resolutionType: ResolutionType.Interactive,
      name: 'Tavern Talk',
      description: 'Locals are talking about something up ahead.',
      conditions: { probability: 0.2, locationTypes: ['town'] },
      interactiveHandlerId: 'dialogue_handler',
      repeatable: true,
      tags: ['dialogue', 'town', 'rumor'],
    };

    const { queryByText } = render(
      <RoadScreen
        gameState={gameState}
        engine={engine}
        onToast={onToast}
        onOpenNpc={onOpenNpc}
        activeEvent={activeEvent}
        textInterval={0}
      />
    );

    await waitFor(() => {
      expect(queryByText('Tavern Talk')).toBeTruthy();
      expect(queryByText('◇ STRANGER NEARBY')).toBeTruthy();
    });
    expect(onOpenNpc).not.toHaveBeenCalled();
  });
});
