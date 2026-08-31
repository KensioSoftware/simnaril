import { faker } from "@faker-js/faker";
import {
  assertIdentical,
  assertInstanceOf,
  assertObjectEquals,
  assertStringIncludes,
  assertThrowsError,
  assertUndefined,
} from "@kensio/smartass";
import { describe, expectTypeOf, it } from "vitest";

import {
  DuplicateEntityError,
  EntityNotFoundError,
  SimResource,
} from "./index.js";

describe("a simulated resource", () => {
  interface Widget {
    id: string;
    name: string;
    status: "created" | "seeded";
  }

  it("seeds and reads exact entities by their conventional id", () => {
    // Given a resource with two exact entities arranged in it.
    const widgets = new SimResource<Widget>({});
    const first: Widget = {
      id: faker.string.uuid(),
      name: faker.commerce.productName(),
      status: "seeded",
    };
    const second: Widget = {
      id: faker.string.uuid(),
      name: faker.commerce.productName(),
      status: "seeded",
    };
    widgets.seed(first);
    widgets.seed(second);

    // When the state is read through each direct lookup API.
    // oxlint-disable-next-line unicorn/no-array-callback-reference -- SimResource.find takes an identity.
    const found = widgets.find(first.id);
    const required = widgets.get(second.id);
    const listed = widgets.list();

    // Then the resource returns the exact entities with their Widget types.
    expectTypeOf(found).toEqualTypeOf<Widget | undefined>();
    expectTypeOf(required).toEqualTypeOf<Widget>();
    expectTypeOf(listed).toEqualTypeOf<Widget[]>();
    assertIdentical(found, first);
    assertIdentical(required, second);
    assertObjectEquals(listed, [first, second]);
  });

  it("uses creation behaviour for create and bypasses it for seed", () => {
    // Given a resource whose service creation behaviour supplies an id and
    // status.
    const generatedId = faker.string.uuid();
    const widgets = new SimResource<Widget>({
      create: (input) => ({
        id: generatedId,
        name: input.name ?? faker.commerce.productName(),
        status: "created",
      }),
    });
    const seeded: Widget = {
      id: faker.string.uuid(),
      name: faker.commerce.productName(),
      status: "seeded",
    };
    const requestedName = faker.commerce.productName();

    // When one entity is seeded and another is created from partial input.
    const seedResult = widgets.seed(seeded);
    const created = widgets.create({ name: requestedName });

    // Then seed preserves its exact input and create stores the entity made by
    // the resource's creation behaviour.
    expectTypeOf(created).toEqualTypeOf<Widget>();
    assertIdentical(seedResult, seeded);
    assertIdentical(widgets.get(seeded.id), seeded);
    assertObjectEquals(created, {
      id: generatedId,
      name: requestedName,
      status: "created",
    });
    assertIdentical(widgets.get(generatedId), created);
  });

  it("creates a supplied entity when no creation behaviour is configured", () => {
    // Given a resource using its conventional creation behaviour.
    const widgets = new SimResource<Widget>({});
    const widget: Widget = {
      id: faker.string.uuid(),
      name: faker.commerce.productName(),
      status: "created",
    };

    // When a complete entity is passed to create.
    const created = widgets.create(widget);

    // Then that entity becomes the stored resource state.
    assertIdentical(created, widget);
    assertIdentical(widgets.get(widget.id), widget);
  });

  it("rejects duplicate identities from seed and create", () => {
    // Given a named resource containing an entity.
    const id = faker.string.uuid();
    const widgets = new SimResource<Widget>({ name: "widget" });
    widgets.seed({
      id,
      name: faker.commerce.productName(),
      status: "seeded",
    });

    // When seed and create try to store the same identity again.
    const seedError = assertThrowsError(() => {
      widgets.seed({
        id,
        name: faker.commerce.productName(),
        status: "seeded",
      });
    });
    const createError = assertThrowsError(() => {
      const unnamedWidgets = new SimResource<Widget>({});
      unnamedWidgets.seed({
        id,
        name: faker.commerce.productName(),
        status: "seeded",
      });
      unnamedWidgets.create({
        id,
        name: faker.commerce.productName(),
        status: "created",
      });
    });

    // Then both operations report the typed domain error and its identity.
    assertInstanceOf(seedError, DuplicateEntityError);
    assertIdentical(seedError.identity, id);
    assertIdentical(seedError.resourceName, "widget");
    assertStringIncludes(seedError.message, "widget");
    assertStringIncludes(seedError.message, id);
    assertInstanceOf(createError, DuplicateEntityError);
    assertUndefined(createError.resourceName);
    assertStringIncludes(createError.message, "entity");
  });

  it("distinguishes an optional find from a required get", () => {
    // Given a resource without the requested entity.
    const widgets = new SimResource<Widget>({});
    const id = faker.string.uuid();

    // When the same identity is found optionally and required explicitly.
    // oxlint-disable-next-line unicorn/no-array-callback-reference -- SimResource.find takes an identity.
    const found = widgets.find(id);
    const error = assertThrowsError(() => widgets.get(id));

    // Then find returns undefined and get reports a typed domain error.
    assertUndefined(found);
    assertInstanceOf(error, EntityNotFoundError);
    assertIdentical(error.identity, id);
    assertUndefined(error.resourceName);
    assertStringIncludes(error.message, "entity");
    assertStringIncludes(error.message, id);
  });

  it("updates an entity and moves it when its identity changes", () => {
    // Given a resource keyed by an identity other than id.
    const widgets = new SimResource<Widget>({
      identify: (widget) => widget.name,
    });
    const widget: Widget = {
      id: faker.string.uuid(),
      name: `widget-${faker.string.uuid()}`,
      status: "seeded",
    };
    widgets.seed(widget);
    const updatedName = `widget-${faker.string.uuid()}`;

    // When an update changes both ordinary state and the resource identity.
    const updated = widgets.update(widget.name, {
      name: updatedName,
      status: "created",
    });

    // Then the merged entity is available under the new identity only.
    assertObjectEquals(updated, {
      ...widget,
      name: updatedName,
      status: "created",
    });
    // oxlint-disable-next-line unicorn/no-array-callback-reference -- SimResource.find takes an identity.
    assertUndefined(widgets.find(widget.name));
    assertIdentical(widgets.get(updatedName), updated);
  });

  it("keeps the original entity when an update would duplicate an identity", () => {
    // Given two entities in a resource with mutable identities.
    const widgets = new SimResource<Widget>({
      identify: (widget) => widget.name,
      name: "widget",
    });
    const first: Widget = {
      id: faker.string.uuid(),
      name: `widget-${faker.string.uuid()}`,
      status: "seeded",
    };
    const second: Widget = {
      id: faker.string.uuid(),
      name: `widget-${faker.string.uuid()}`,
      status: "seeded",
    };
    widgets.seed(first);
    widgets.seed(second);

    // When one entity is updated to the other's identity.
    const error = assertThrowsError(() => {
      widgets.update(first.name, { name: second.name });
    });

    // Then the duplicate is rejected without changing either stored entity.
    assertInstanceOf(error, DuplicateEntityError);
    assertIdentical(error.identity, second.name);
    assertIdentical(widgets.get(first.name), first);
    assertIdentical(widgets.get(second.name), second);
  });

  it("updates under the existing identity without changing its position", () => {
    // Given two entities whose insertion order is observable through list.
    const widgets = new SimResource<Widget>({});
    const first: Widget = {
      id: faker.string.uuid(),
      name: faker.commerce.productName(),
      status: "seeded",
    };
    const second: Widget = {
      id: faker.string.uuid(),
      name: faker.commerce.productName(),
      status: "seeded",
    };
    widgets.seed(first);
    widgets.seed(second);

    // When an ordinary field is updated without changing identity.
    const updated = widgets.update(first.id, { status: "created" });

    // Then the entity keeps its place in the resource's list.
    assertObjectEquals(widgets.list(), [updated, second]);
  });

  it("requires an existing entity for update and delete", () => {
    // Given a named resource without the requested entity.
    const widgets = new SimResource<Widget>({ name: "widget" });
    const id = faker.string.uuid();

    // When mutations target that missing identity.
    const updateError = assertThrowsError(() => {
      widgets.update(id, { name: faker.commerce.productName() });
    });
    const deleteError = assertThrowsError(() => widgets.delete(id));

    // Then both mutations throw the same typed missing-entity error.
    assertInstanceOf(updateError, EntityNotFoundError);
    assertIdentical(updateError.resourceName, "widget");
    assertStringIncludes(updateError.message, "widget");
    assertInstanceOf(deleteError, EntityNotFoundError);
  });

  it("deletes an existing entity and returns it", () => {
    // Given a resource containing an entity.
    const widgets = new SimResource<Widget>({});
    const widget: Widget = {
      id: faker.string.uuid(),
      name: faker.commerce.productName(),
      status: "seeded",
    };
    widgets.seed(widget);

    // When the entity is deleted.
    const deleted = widgets.delete(widget.id);

    // Then the deleted entity is returned and no longer appears in state.
    assertIdentical(deleted, widget);
    // oxlint-disable-next-line unicorn/no-array-callback-reference -- SimResource.find takes an identity.
    assertUndefined(widgets.find(widget.id));
    assertObjectEquals(widgets.list(), []);
  });

  it("keeps instances isolated and clears only the selected resource", () => {
    // Given two resource instances containing different entities.
    const first = new SimResource<Widget>({});
    const second = new SimResource<Widget>({});
    const firstWidget: Widget = {
      id: faker.string.uuid(),
      name: faker.commerce.productName(),
      status: "seeded",
    };
    const secondWidget: Widget = {
      id: faker.string.uuid(),
      name: faker.commerce.productName(),
      status: "seeded",
    };
    first.seed(firstWidget);
    second.seed(secondWidget);

    // When the first resource is cleared.
    first.clear();

    // Then the first is empty and the second keeps its own state.
    assertObjectEquals(first.list(), []);
    assertObjectEquals(second.list(), [secondWidget]);
  });
});
