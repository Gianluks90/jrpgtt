import { Component, computed, inject, OnDestroy, signal } from "@angular/core";
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from "@angular/forms";
import { getAuth } from "firebase/auth";
import { Dialog } from "@angular/cdk/dialog";
import { Subscription, firstValueFrom } from "rxjs";
import { Router } from "@angular/router";
import { EnemyCatalogService } from "@services/catalog/enemy-catalog-service";
import { ItemCatalogService } from "@services/catalog/item-catalog-service";
import { FollowerCatalogService } from "@services/catalog/follower-catalog-service";
import { ExplorationCatalogService } from "@services/catalog/exploration-catalog-service";
import { EnemyCatalogEntry } from "@models/catalog/EnemyCatalog";
import { ItemDefinition } from "@models/catalog/ItemCatalog";
import { FollowerDefinition } from "@models/player/FollowerCatalog";
import {
    EventCardDef,
    PlaceCardDef,
    StrangerCardDef,
} from "@models/catalog/ExplorationCardCatalog";
import { DialogResponse } from "@models/ui/DialogResponse";
import { GenericConfirmDialog, GenericConfirmDialogData } from "../../components/dialogs/generic-confirm-dialog/generic-confirm-dialog";
import { DIALOGS_CONFIG } from "../../consts/ui/dialog-configs";

type CardTabType = "enemy" | "item" | "follower" | "event" | "place" | "stranger";

const ADMIN_USER_ID = "JV4eWsYVQbXdIw9qU00buX0DSaJ2";

@Component({
    selector: "app-admin-page",
    imports: [ReactiveFormsModule],
    templateUrl: "./admin-page.html",
    styleUrl: "./admin-page.scss",
})
export class AdminPage implements OnDestroy {
    private fb = inject(FormBuilder);
    private dialog = inject(Dialog);
    private router = inject(Router);
    private enemyCatalogService = inject(EnemyCatalogService);
    private itemCatalogService = inject(ItemCatalogService);
    private followerCatalogService = inject(FollowerCatalogService);
    private explorationCatalogService = inject(ExplorationCatalogService);

    public readonly isAdmin = getAuth().currentUser?.uid === ADMIN_USER_ID;

    public readonly tabs: { id: CardTabType; label: string }[] = [
        { id: "enemy", label: "Enemy" },
        { id: "item", label: "Item" },
        { id: "follower", label: "Follower" },
        { id: "event", label: "Event" },
        { id: "place", label: "Place" },
        { id: "stranger", label: "Stranger" },
    ];

    public activeTab = signal<CardTabType>("enemy");
    public isLoading = signal(false);
    public filterQuery = signal("");
    public copied = signal(false);
    private copiedTimer: ReturnType<typeof setTimeout> | null = null;

    private enemyEntries = signal<EnemyCatalogEntry[]>([]);
    private itemEntries = signal<ItemDefinition[]>([]);
    private followerEntries = signal<FollowerDefinition[]>([]);
    private explorationEvents = signal<EventCardDef[]>([]);
    private explorationPlaces = signal<PlaceCardDef[]>([]);
    private explorationStrangers = signal<StrangerCardDef[]>([]);
    private configsLoaded = new Set<string>();

    public form!: FormGroup;
    private idWasManuallyEdited = false;
    private formSubs: Subscription[] = [];

    constructor() {
        if (this.isAdmin) {
            this.buildForm();
            void this.loadCurrentTabConfig();
        }
    }

    public ngOnDestroy(): void {
        this.clearFormSubs();
        if (this.copiedTimer) clearTimeout(this.copiedTimer);
    }

    // ── Computed ─────────────────────────────────────────────────────────────

    public readonly activeTabLabel = computed(() => {
        return this.tabs.find((t) => t.id === this.activeTab())?.label ?? "";
    });

    public readonly jsonPreview = computed<string>(() => {
        const tab = this.activeTab();
        switch (tab) {
            case "enemy":
                return JSON.stringify({ enemies: this.enemyEntries() }, null, 2);
            case "item":
                return JSON.stringify({ items: this.itemEntries() }, null, 2);
            case "follower":
                return JSON.stringify({ followers: this.followerEntries() }, null, 2);
            case "event":
            case "place":
            case "stranger":
                return JSON.stringify({
                    events: this.explorationEvents(),
                    places: this.explorationPlaces(),
                    strangers: this.explorationStrangers(),
                }, null, 2);
        }
    });

    private readonly currentEntries = computed<{ id: string; name: string }[]>(() => {
        const tab = this.activeTab();
        switch (tab) {
            case "enemy":    return this.enemyEntries().map((e) => ({ id: e.id, name: e.name }));
            case "item":     return this.itemEntries().map((e) => ({ id: e.id, name: e.name }));
            case "follower": return this.followerEntries().map((e) => ({ id: e.id, name: e.name }));
            case "event":    return this.explorationEvents().map((e) => ({ id: e.id, name: e.name }));
            case "place":    return this.explorationPlaces().map((e) => ({ id: e.id, name: e.name }));
            case "stranger": return this.explorationStrangers().map((e) => ({ id: e.id, name: e.name }));
        }
    });

    public readonly filteredEntries = computed<{ id: string; name: string }[]>(() => {
        const q = this.filterQuery().toLowerCase().trim();
        if (!q) return this.currentEntries();
        return this.currentEntries().filter(
            (e) => e.name.toLowerCase().includes(q) || e.id.toLowerCase().includes(q),
        );
    });

    public readonly effectTypeNeedsAmount = computed<boolean>(() => {
        const t = this.form?.get("effectType")?.value;
        return ["lose-hp", "gain-hp", "lose-gold", "gain-gold"].includes(t);
    });

    public readonly isConsumable = computed<boolean>(() => {
        return Boolean(this.form?.get("consumable")?.value);
    });

    // ── Tab switching ─────────────────────────────────────────────────────────

    public async onTabClick(tab: CardTabType): Promise<void> {
        if (tab === this.activeTab()) return;

        if (this.form?.dirty) {
            const dialogData: GenericConfirmDialogData = {
                title: "Cambia tab",
                message: "Il form ha modifiche non salvate. Procedere?",
                confirmText: "Sì, cambia tab",
                cancelText: "Annulla",
            };
            const result = await firstValueFrom(
                this.dialog.open<DialogResponse<never>>(GenericConfirmDialog, {
                    ...DIALOGS_CONFIG,
                    data: dialogData,
                }).closed,
            );
            if (result?.result !== "confirm") return;
        }

        this.activeTab.set(tab);
        this.filterQuery.set("");
        this.buildForm();
        void this.loadCurrentTabConfig();
    }

    // ── Config loading ────────────────────────────────────────────────────────

    private async loadCurrentTabConfig(): Promise<void> {
        const tab = this.activeTab();
        if (this.configsLoaded.has(tab)) return;

        this.isLoading.set(true);
        try {
            switch (tab) {
                case "enemy": {
                    const config = await this.enemyCatalogService.loadConfig();
                    this.enemyEntries.set([...config.enemies]);
                    this.configsLoaded.add("enemy");
                    break;
                }
                case "item": {
                    const config = await this.itemCatalogService.loadConfig();
                    this.itemEntries.set([...config.items]);
                    this.configsLoaded.add("item");
                    break;
                }
                case "follower": {
                    const config = await this.followerCatalogService.loadConfig();
                    this.followerEntries.set([...config.followers]);
                    this.configsLoaded.add("follower");
                    break;
                }
                case "event":
                case "place":
                case "stranger": {
                    const isAnyExplorationLoaded = this.configsLoaded.has("event")
                        || this.configsLoaded.has("place")
                        || this.configsLoaded.has("stranger");
                    if (!isAnyExplorationLoaded) {
                        const config = await this.explorationCatalogService.loadConfig();
                        this.explorationEvents.set([...config.events]);
                        this.explorationPlaces.set([...config.places]);
                        this.explorationStrangers.set([...config.strangers]);
                    }
                    this.configsLoaded.add("event");
                    this.configsLoaded.add("place");
                    this.configsLoaded.add("stranger");
                    break;
                }
            }
        } catch (error) {
            console.error("Failed to load config for tab", tab, error);
        } finally {
            this.isLoading.set(false);
        }
    }

    // ── Form building ─────────────────────────────────────────────────────────

    private buildForm(): void {
        this.clearFormSubs();
        this.idWasManuallyEdited = false;

        switch (this.activeTab()) {
            case "enemy":    this.form = this.buildEnemyForm();    break;
            case "item":     this.form = this.buildItemForm();     break;
            case "follower": this.form = this.buildFollowerForm(); break;
            case "event":    this.form = this.buildEventForm();    break;
            case "place":    this.form = this.buildPlaceForm();    break;
            case "stranger": this.form = this.buildStrangerForm(); break;
        }

        this.setupAutoId();
    }

    private buildEnemyForm(): FormGroup {
        return this.fb.group({
            id:           ["", [Validators.required, Validators.pattern(/^[a-z0-9-]+$/)]],
            name:         ["", Validators.required],
            combatStat:   ["strength", Validators.required],
            levelUpMode:  ["BestFirst", Validators.required],
            time:         ["day", Validators.required],
            element:      [""],
            baseStrength: [1, [Validators.required, Validators.min(1)]],
            baseMagic:    [1, [Validators.required, Validators.min(1)]],
            baseLuck:     [1, [Validators.required, Validators.min(1)]],
            loot:         ["[]"],
        });
    }

    private buildItemForm(): FormGroup {
        return this.fb.group({
            id:                 ["", [Validators.required, Validators.pattern(/^[a-z0-9-]+$/)]],
            name:               ["", Validators.required],
            description:        ["", Validators.required],
            category:           ["weapon", Validators.required],
            occupiesSpace:      [true],
            consumable:         [false],
            purchaseValue:      [0, [Validators.required, Validators.min(0)]],
            maxCharges:         [""],
            actions:            ["[]"],
            parameterModifiers: [""],
            constraints:        [""],
        });
    }

    private buildFollowerForm(): FormGroup {
        return this.fb.group({
            id:                 ["", [Validators.required, Validators.pattern(/^[a-z0-9-]+$/)]],
            name:               ["", Validators.required],
            description:        ["", Validators.required],
            category:           ["companion", Validators.required],
            maxHp:              [4, [Validators.required, Validators.min(1)]],
            itemCapacityBonus:  [""],
            actions:            ["[]"],
            parameterModifiers: [""],
        });
    }

    private buildEventForm(): FormGroup {
        return this.fb.group({
            id:           ["", [Validators.required, Validators.pattern(/^[a-z0-9-]+$/)]],
            name:         ["", Validators.required],
            description:  ["", Validators.required],
            duration:     ["instant", Validators.required],
            effectType:   ["none", Validators.required],
            effectAmount: [""],
        });
    }

    private buildPlaceForm(): FormGroup {
        return this.fb.group({
            id:          ["", [Validators.required, Validators.pattern(/^[a-z0-9-]+$/)]],
            name:        ["", Validators.required],
            description: ["", Validators.required],
        });
    }

    private buildStrangerForm(): FormGroup {
        return this.fb.group({
            id:           ["", [Validators.required, Validators.pattern(/^[a-z0-9-]+$/)]],
            name:         ["", Validators.required],
            description:  ["", Validators.required],
            persistent:   [false],
            dialogType:   ["healer", Validators.required],
            dialogParams: ["{}"],
        });
    }

    private setupAutoId(): void {
        const nameSub = this.form.get("name")?.valueChanges.subscribe((value: string) => {
            if (!this.idWasManuallyEdited) {
                this.form.get("id")?.setValue(this.toKebabCase(value), { emitEvent: false });
            }
        });
        const idSub = this.form.get("id")?.valueChanges.subscribe(() => {
            this.idWasManuallyEdited = true;
        });
        if (nameSub) this.formSubs.push(nameSub);
        if (idSub) this.formSubs.push(idSub);
    }

    private clearFormSubs(): void {
        this.formSubs.forEach((s) => s.unsubscribe());
        this.formSubs = [];
    }

    // ── Add entry ─────────────────────────────────────────────────────────────

    public onAddEntry(): void {
        if (this.form.invalid) {
            this.form.markAllAsTouched();
            return;
        }

        try {
            switch (this.activeTab()) {
                case "enemy":    this.addEnemyEntry();    break;
                case "item":     this.addItemEntry();     break;
                case "follower": this.addFollowerEntry(); break;
                case "event":    this.addEventEntry();    break;
                case "place":    this.addPlaceEntry();    break;
                case "stranger": this.addStrangerEntry(); break;
            }
            this.idWasManuallyEdited = false;
            this.form.reset(this.getFormDefaults(this.activeTab()));
            this.form.markAsPristine();
        } catch (error) {
            window.alert(error instanceof Error ? error.message : "Errore durante l'aggiunta");
        }
    }

    private addEnemyEntry(): void {
        const v = this.form.value;
        const entry: EnemyCatalogEntry = {
            id: v.id,
            name: v.name,
            combatStat: v.combatStat,
            levelUpMode: v.levelUpMode,
            time: v.time,
            baseStrength: Number(v.baseStrength),
            baseMagic: Number(v.baseMagic),
            baseLuck: Number(v.baseLuck),
        };
        if (v.element) entry.element = v.element;
        const loot = this.parseJsonField(v.loot, "loot");
        if (Array.isArray(loot) && loot.length > 0) entry.loot = loot as EnemyCatalogEntry["loot"];
        this.enemyEntries.update((entries) => [...entries, entry]);
    }

    private addItemEntry(): void {
        const v = this.form.value;
        const entry: ItemDefinition = {
            id: v.id,
            name: v.name,
            description: v.description,
            category: v.category,
            occupiesSpace: Boolean(v.occupiesSpace),
            consumable: Boolean(v.consumable),
            purchaseValue: Number(v.purchaseValue),
            actions: (this.parseJsonField(v.actions, "actions") ?? []) as string[],
        };
        if (v.consumable && v.maxCharges !== "" && v.maxCharges !== null) {
            entry.maxCharges = Math.max(1, Number(v.maxCharges));
        }
        const modifiers = this.parseJsonField(v.parameterModifiers, "parameterModifiers");
        if (Array.isArray(modifiers) && modifiers.length > 0) {
            entry.parameterModifiers = modifiers as ItemDefinition["parameterModifiers"];
        }
        const constraints = this.parseJsonField(v.constraints, "constraints");
        if (constraints && typeof constraints === "object" && !Array.isArray(constraints)) {
            entry.constraints = constraints as ItemDefinition["constraints"];
        }
        this.itemEntries.update((entries) => [...entries, entry]);
    }

    private addFollowerEntry(): void {
        const v = this.form.value;
        const entry: FollowerDefinition = {
            id: v.id,
            name: v.name,
            description: v.description,
            category: v.category || "companion",
            maxHp: Math.max(1, Number(v.maxHp)),
            actions: (this.parseJsonField(v.actions, "actions") ?? []) as string[],
        };
        if (v.itemCapacityBonus !== "" && v.itemCapacityBonus !== null) {
            entry.itemCapacityBonus = Number(v.itemCapacityBonus);
        }
        const modifiers = this.parseJsonField(v.parameterModifiers, "parameterModifiers");
        if (Array.isArray(modifiers) && modifiers.length > 0) {
            entry.parameterModifiers = modifiers as FollowerDefinition["parameterModifiers"];
        }
        this.followerEntries.update((entries) => [...entries, entry]);
    }

    private addEventEntry(): void {
        const v = this.form.value;
        const entry: EventCardDef = {
            type: "event",
            id: v.id,
            name: v.name,
            description: v.description,
            duration: v.duration,
        };
        if (v.effectType && v.effectType !== "none") {
            entry.effect = { type: v.effectType };
            if (this.effectTypeNeedsAmount() && v.effectAmount !== "") {
                entry.effect.amount = Number(v.effectAmount);
            }
        }
        this.explorationEvents.update((entries) => [...entries, entry]);
    }

    private addPlaceEntry(): void {
        const v = this.form.value;
        const entry: PlaceCardDef = {
            type: "place",
            id: v.id,
            name: v.name,
            description: v.description,
        };
        this.explorationPlaces.update((entries) => [...entries, entry]);
    }

    private addStrangerEntry(): void {
        const v = this.form.value;
        const entry: StrangerCardDef = {
            type: "stranger",
            id: v.id,
            name: v.name,
            description: v.description,
            persistent: Boolean(v.persistent),
            dialogType: v.dialogType,
        };
        const params = this.parseJsonField(v.dialogParams, "dialogParams");
        if (params && typeof params === "object" && !Array.isArray(params) && Object.keys(params).length > 0) {
            entry.dialogParams = params as Record<string, unknown>;
        }
        this.explorationStrangers.update((entries) => [...entries, entry]);
    }

    // ── Load entry for edit ───────────────────────────────────────────────────

    public onLoadEntry(id: string): void {
        const tab = this.activeTab();
        let data: Record<string, unknown> | null = null;

        switch (tab) {
            case "enemy": {
                const e = this.enemyEntries().find((x) => x.id === id);
                if (e) data = {
                    id: e.id, name: e.name, combatStat: e.combatStat, levelUpMode: e.levelUpMode,
                    time: e.time, element: e.element ?? "",
                    baseStrength: e.baseStrength, baseMagic: e.baseMagic, baseLuck: e.baseLuck,
                    loot: e.loot ? JSON.stringify(e.loot, null, 2) : "[]",
                };
                break;
            }
            case "item": {
                const e = this.itemEntries().find((x) => x.id === id);
                if (e) data = {
                    id: e.id, name: e.name, description: e.description, category: e.category,
                    occupiesSpace: e.occupiesSpace, consumable: e.consumable, purchaseValue: e.purchaseValue,
                    maxCharges: e.maxCharges ?? "",
                    actions: JSON.stringify(e.actions ?? [], null, 2),
                    parameterModifiers: e.parameterModifiers ? JSON.stringify(e.parameterModifiers, null, 2) : "",
                    constraints: e.constraints ? JSON.stringify(e.constraints, null, 2) : "",
                };
                break;
            }
            case "follower": {
                const e = this.followerEntries().find((x) => x.id === id);
                if (e) data = {
                    id: e.id, name: e.name, description: e.description, category: e.category,
                    maxHp: e.maxHp, itemCapacityBonus: e.itemCapacityBonus ?? "",
                    actions: JSON.stringify(e.actions ?? [], null, 2),
                    parameterModifiers: e.parameterModifiers ? JSON.stringify(e.parameterModifiers, null, 2) : "",
                };
                break;
            }
            case "event": {
                const e = this.explorationEvents().find((x) => x.id === id);
                if (e) data = {
                    id: e.id, name: e.name, description: e.description, duration: e.duration,
                    effectType: e.effect?.type ?? "none",
                    effectAmount: e.effect?.amount ?? "",
                };
                break;
            }
            case "place": {
                const e = this.explorationPlaces().find((x) => x.id === id);
                if (e) data = { id: e.id, name: e.name, description: e.description };
                break;
            }
            case "stranger": {
                const e = this.explorationStrangers().find((x) => x.id === id);
                if (e) data = {
                    id: e.id, name: e.name, description: e.description,
                    persistent: e.persistent, dialogType: e.dialogType,
                    dialogParams: e.dialogParams ? JSON.stringify(e.dialogParams, null, 2) : "{}",
                };
                break;
            }
        }

        if (!data) return;
        this.idWasManuallyEdited = true;
        this.form.patchValue(data);
        this.form.markAsPristine();
    }

    // ── Copy JSON ─────────────────────────────────────────────────────────────

    public async onCopyJson(): Promise<void> {
        try {
            await navigator.clipboard.writeText(this.jsonPreview());
            this.copied.set(true);
            if (this.copiedTimer) clearTimeout(this.copiedTimer);
            this.copiedTimer = setTimeout(() => this.copied.set(false), 2000);
        } catch (error) {
            console.error("Copy failed", error);
        }
    }

    public onBack(): void {
        void this.router.navigate(["/home"]);
    }

    // ── Utils ─────────────────────────────────────────────────────────────────

    private toKebabCase(value: string): string {
        return (value ?? "")
            .toLowerCase()
            .replace(/[^a-z0-9\s-]/g, "")
            .replace(/\s+/g, "-")
            .replace(/-+/g, "-")
            .replace(/^-|-$/g, "");
    }

    private parseJsonField(value: string, fieldName: string): unknown {
        if (!value || !String(value).trim()) return null;
        try {
            return JSON.parse(value);
        } catch {
            throw new Error(`Campo "${fieldName}" non è JSON valido`);
        }
    }

    private getFormDefaults(tab: CardTabType): Record<string, unknown> {
        switch (tab) {
            case "enemy":    return { id: "", name: "", combatStat: "strength", levelUpMode: "BestFirst", time: "day", element: "", baseStrength: 1, baseMagic: 1, baseLuck: 1, loot: "[]" };
            case "item":     return { id: "", name: "", description: "", category: "weapon", occupiesSpace: true, consumable: false, purchaseValue: 0, maxCharges: "", actions: "[]", parameterModifiers: "", constraints: "" };
            case "follower": return { id: "", name: "", description: "", category: "companion", maxHp: 4, itemCapacityBonus: "", actions: "[]", parameterModifiers: "" };
            case "event":    return { id: "", name: "", description: "", duration: "instant", effectType: "none", effectAmount: "" };
            case "place":    return { id: "", name: "", description: "" };
            case "stranger": return { id: "", name: "", description: "", persistent: false, dialogType: "healer", dialogParams: "{}" };
        }
    }
}
