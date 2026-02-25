/**
 * Shared data mapping utilities for building relationship maps between entities.
 * These functions are used across multiple pages to resolve relationships between
 * contacts, operations, billing entities, fields, and probes.
 */

import type { Contact, Operation, BillingEntity } from './baserow';

/**
 * Build a map of operation ID to operation name
 */
export function buildOperationMap(operations: Operation[]): Map<number, string> {
  const map = new Map<number, string>();
  operations.forEach((op) => {
    map.set(op.id, op.name);
  });
  return map;
}

/**
 * Build a map of billing entity ID to billing entity name
 */
export function buildBillingEntityMap(billingEntities: BillingEntity[]): Map<number, string> {
  const map = new Map<number, string>();
  billingEntities.forEach((be) => {
    map.set(be.id, be.name);
  });
  return map;
}

/**
 * Build relationship maps between billing entities and operations via contacts.
 * Returns:
 * - billingToOperationMap: Maps billing entity ID to first operation ID
 * - billingToOperationIds: Maps billing entity ID to all operation IDs
 * - billingToOperationNames: Maps billing entity ID to all operation names
 */
export function buildBillingToOperationMaps(
  contacts: Contact[],
  operationMap: Map<number, string>
): {
  billingToOperationMap: Map<number, number>;
  billingToOperationIds: Map<number, number[]>;
  billingToOperationNames: Map<number, string[]>;
} {
  const billingToOperationMap = new Map<number, number>();
  const billingToOperationIds = new Map<number, number[]>();
  const billingToOperationNames = new Map<number, string[]>();

  contacts.forEach((contact) => {
    const contactOpIds = contact.operations?.map((op) => op.id) || [];
    const contactBeIds = contact.billing_entity?.map((be) => be.id) || [];

    contactBeIds.forEach((beId) => {
      contactOpIds.forEach((opId) => {
        // Store first operation ID for each billing entity
        if (!billingToOperationMap.has(beId)) {
          billingToOperationMap.set(beId, opId);
        }

        // Collect all operation IDs
        const existingIds = billingToOperationIds.get(beId) || [];
        if (!existingIds.includes(opId)) {
          existingIds.push(opId);
        }
        billingToOperationIds.set(beId, existingIds);

        // Collect all operation names
        const existingNames = billingToOperationNames.get(beId) || [];
        const opName = operationMap.get(opId) || 'Unknown';
        if (!existingNames.includes(opName)) {
          existingNames.push(opName);
        }
        billingToOperationNames.set(beId, existingNames);
      });
    });
  });

  return { billingToOperationMap, billingToOperationIds, billingToOperationNames };
}

/**
 * Build relationship maps between contacts and operations.
 * Returns:
 * - contactToOperationIds: Maps contact ID to all operation IDs
 * - contactToOperationNames: Maps contact ID to all operation names
 */
export function buildContactToOperationMaps(
  contacts: Contact[],
  operationMap: Map<number, string>
): {
  contactToOperationIds: Map<number, number[]>;
  contactToOperationNames: Map<number, string[]>;
} {
  const contactToOperationIds = new Map<number, number[]>();
  const contactToOperationNames = new Map<number, string[]>();

  contacts.forEach((contact) => {
    const opIds = contact.operations?.map((op) => op.id) || [];
    contactToOperationIds.set(contact.id, opIds);

    const opNames = opIds.map((id) => operationMap.get(id) || 'Unknown');
    contactToOperationNames.set(contact.id, opNames);
  });

  return { contactToOperationIds, contactToOperationNames };
}

/**
 * Build relationship maps between contacts and billing entities.
 * Returns:
 * - contactToBillingEntityIds: Maps contact ID to all billing entity IDs
 * - contactToBillingEntityNames: Maps contact ID to all billing entity names
 */
export function buildContactToBillingEntityMaps(
  contacts: Contact[],
  billingEntityMap: Map<number, string>
): {
  contactToBillingEntityIds: Map<number, number[]>;
  contactToBillingEntityNames: Map<number, string[]>;
} {
  const contactToBillingEntityIds = new Map<number, number[]>();
  const contactToBillingEntityNames = new Map<number, string[]>();

  contacts.forEach((contact) => {
    const beIds = contact.billing_entity?.map((be) => be.id) || [];
    contactToBillingEntityIds.set(contact.id, beIds);

    const beNames = beIds.map((id) => billingEntityMap.get(id) || 'Unknown');
    contactToBillingEntityNames.set(contact.id, beNames);
  });

  return { contactToBillingEntityIds, contactToBillingEntityNames };
}

/**
 * Build a map of operation ID to billing entity IDs
 */
export function buildOperationToBillingEntityMap(
  contacts: Contact[]
): Map<number, number[]> {
  const operationToBillingEntityIds = new Map<number, number[]>();

  contacts.forEach((contact) => {
    const contactOpIds = contact.operations?.map((op) => op.id) || [];
    const contactBeIds = contact.billing_entity?.map((be) => be.id) || [];

    contactOpIds.forEach((opId) => {
      const existingBeIds = operationToBillingEntityIds.get(opId) || [];
      contactBeIds.forEach((beId) => {
        if (!existingBeIds.includes(beId)) {
          existingBeIds.push(beId);
        }
      });
      operationToBillingEntityIds.set(opId, existingBeIds);
    });
  });

  return operationToBillingEntityIds;
}

/**
 * Get the primary operation name for a billing entity ID
 */
export function getOperationNameForBillingEntity(
  billingEntityId: number | null | undefined,
  billingToOperationMap: Map<number, number>,
  operationMap: Map<number, string>
): string {
  if (!billingEntityId) return 'Unknown';
  const opId = billingToOperationMap.get(billingEntityId);
  if (!opId) return 'Unknown';
  return operationMap.get(opId) || 'Unknown';
}

/**
 * Comprehensive data relationships builder.
 * Builds all common relationship maps in one call.
 */
export function buildAllRelationshipMaps(
  contacts: Contact[],
  operations: Operation[],
  billingEntities: BillingEntity[]
): {
  operationMap: Map<number, string>;
  billingEntityMap: Map<number, string>;
  billingToOperationMap: Map<number, number>;
  billingToOperationIds: Map<number, number[]>;
  billingToOperationNames: Map<number, string[]>;
  contactToOperationIds: Map<number, number[]>;
  contactToOperationNames: Map<number, string[]>;
  contactToBillingEntityIds: Map<number, number[]>;
  contactToBillingEntityNames: Map<number, string[]>;
  operationToBillingEntityIds: Map<number, number[]>;
} {
  const operationMap = buildOperationMap(operations);
  const billingEntityMap = buildBillingEntityMap(billingEntities);

  const billingToOp = buildBillingToOperationMaps(contacts, operationMap);
  const contactToOp = buildContactToOperationMaps(contacts, operationMap);
  const contactToBe = buildContactToBillingEntityMaps(contacts, billingEntityMap);
  const opToBe = buildOperationToBillingEntityMap(contacts);

  return {
    operationMap,
    billingEntityMap,
    ...billingToOp,
    ...contactToOp,
    ...contactToBe,
    operationToBillingEntityIds: opToBe,
  };
}
