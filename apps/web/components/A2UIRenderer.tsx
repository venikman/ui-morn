"use client";

import React from "react";
import type { A2UISurfaces, SurfaceState } from "../lib/a2ui";
import { getPath } from "../lib/a2ui";

const resolveText = (text: string, context: Record<string, unknown>) => {
  return text.replace(/\{\{item\.([^}]+)}}/g, (_, key) => {
    const value = (context.item as Record<string, unknown>)?.[key];
    return value === undefined ? "" : String(value);
  });
};

type RendererProps = {
  surfaces: A2UISurfaces;
  onAction: (surfaceId: string, action: string, model: Record<string, unknown>) => void;
  onUpdateModel: (surfaceId: string, path: string, value: unknown) => void;
};

type ComponentNode = {
  id: string;
  type: string;
  props?: Record<string, unknown>;
  children?: string[];
  dataBinding?: { path?: string };
};

export const A2UIRenderer = ({ surfaces, onAction, onUpdateModel }: RendererProps) => {
  return (
    <div className="a2ui-surfaces">
      {Object.values(surfaces).map((surface) => (
        <div key={surface.surfaceId} className="a2ui-surface">
          {!surface.ready ? (
            <div className="a2ui-placeholder">Waiting for beginRendering...</div>
          ) : (
            renderComponent("root", surface, onAction, onUpdateModel, {})
          )}
        </div>
      ))}
    </div>
  );
};

const renderComponent = (
  componentId: string,
  surface: SurfaceState,
  onAction: RendererProps["onAction"],
  onUpdateModel: RendererProps["onUpdateModel"],
  context: Record<string, unknown>
): React.ReactNode => {
  const component = surface.components[componentId] as ComponentNode | undefined;
  if (!component) {
    return null;
  }

  const children = component.children ?? [];

  switch (component.type) {
    case "Row":
      return (
        <div key={component.id} className="a2ui-row">
          {children.map((child) =>
            renderComponent(child, surface, onAction, onUpdateModel, context)
          )}
        </div>
      );
    case "Column":
      return (
        <div key={component.id} className="a2ui-column">
          {children.map((child) =>
            renderComponent(child, surface, onAction, onUpdateModel, context)
          )}
        </div>
      );
    case "Text": {
      const text = (component.props?.text as string | undefined) ?? "";
      const tone = (component.props?.tone as string | undefined) ?? "body";
      const resolved = resolveText(text, context);
      const className = tone === "headline" ? "a2ui-text headline" : "a2ui-text";
      return (
        <div key={component.id} className={className}>
          {resolved}
        </div>
      );
    }
    case "Card":
      return (
        <div key={component.id} className="a2ui-card">
          {children.map((child) =>
            renderComponent(child, surface, onAction, onUpdateModel, context)
          )}
        </div>
      );
    case "TextField": {
      const bindingPath = component.props?.bindingPath as string | undefined;
      const placeholder = component.props?.placeholder as string | undefined;
      const value = (getPath(surface.dataModel, bindingPath) as string | undefined) ?? "";
      return (
        <input
          key={component.id}
          className="a2ui-input"
          placeholder={placeholder}
          value={value}
          onChange={(event) => {
            if (bindingPath) {
              onUpdateModel(surface.surfaceId, bindingPath, event.target.value);
            }
          }}
        />
      );
    }
    case "Checkbox": {
      const bindingPath = component.props?.bindingPath as string | undefined;
      const label = component.props?.label as string | undefined;
      const checked = Boolean(getPath(surface.dataModel, bindingPath));
      return (
        <label key={component.id} className="a2ui-checkbox">
          <input
            type="checkbox"
            checked={checked}
            onChange={(event) => {
              if (bindingPath) {
                onUpdateModel(surface.surfaceId, bindingPath, event.target.checked);
              }
            }}
          />
          <span>{label}</span>
        </label>
      );
    }
    case "Button": {
      const label = component.props?.label as string | undefined;
      const action = component.props?.action as string | undefined;
      return (
        <button
          key={component.id}
          className="a2ui-button"
          type="button"
          onClick={() => {
            if (action) {
              onAction(surface.surfaceId, action, surface.dataModel);
            }
          }}
        >
          {label ?? "Action"}
        </button>
      );
    }
    case "Tabs": {
      const options = (component.props?.options as Array<{ value: string; label: string }>) ?? [];
      const bindingPath = component.props?.bindingPath as string | undefined;
      const current = bindingPath ? (getPath(surface.dataModel, bindingPath) as string | undefined) : undefined;
      return (
        <div key={component.id} className="a2ui-tabs">
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              className={
                option.value === current ? "a2ui-tab active" : "a2ui-tab"
              }
              onClick={() => {
                if (bindingPath) {
                  onUpdateModel(surface.surfaceId, bindingPath, option.value);
                }
              }}
            >
              {option.label}
            </button>
          ))}
        </div>
      );
    }
    case "List": {
      const templateId = component.props?.templateComponentId as string | undefined;
      const path = component.dataBinding?.path;
      const value = (getPath(surface.dataModel, path) as Record<string, unknown> | undefined) ?? {};
      const items = Array.isArray(value.items) ? value.items : [];
      return (
        <div key={component.id} className="a2ui-list">
          {items.map((item, index) => (
            <div key={`${component.id}-${index}`} className="a2ui-list-item">
              {templateId
                ? renderComponent(templateId, surface, onAction, onUpdateModel, { item })
                : JSON.stringify(item)}
            </div>
          ))}
        </div>
      );
    }
    case "Modal": {
      const bindingPath = component.dataBinding?.path;
      const open = bindingPath ? Boolean(getPath(surface.dataModel, bindingPath)) : Boolean(component.props?.open);
      if (!open) {
        return null;
      }
      return (
        <div key={component.id} className="a2ui-modal">
          <div className="a2ui-modal-content">
            {children.map((child) =>
              renderComponent(child, surface, onAction, onUpdateModel, context)
            )}
          </div>
        </div>
      );
    }
    default:
      return (
        <div key={component.id} className="a2ui-unknown">
          Unsupported component: {component.type}
        </div>
      );
  }
};
