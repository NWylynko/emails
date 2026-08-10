"use client";

import Pusher from "pusher-js";
import { createContext, useContext, useEffect, useState } from "react";
import { createStore, useStore, type StoreApi } from "zustand";

type Store = {
  updates: number;
  reset: () => void;
};

const context = createContext<StoreApi<Store> | null>(null);

/**
 * Pusher's key and cluster arrive as props from the authenticated layout rather
 * than from NEXT_PUBLIC_ variables. The layout is a server component, so it can
 * read them at runtime — which keeps them out of the client bundle at build
 * time and means they need no NEXT_PUBLIC_ prefix in Infisical.
 */
export const UpdatesProvider = (props: {
  children: React.ReactNode;
  pusherKey: string;
  pusherCluster: string;
}) => {
  const [store] = useState(() =>
    createStore<Store>()((set) => ({
      updates: 0,
      reset: () => set({ updates: 0 }),
    }))
  );

  useEffect(() => {
    const pusher = new Pusher(props.pusherKey, {
      cluster: props.pusherCluster,
    });

    const channel = pusher.subscribe("updates");

    channel.bind("update", () => {
      store.setState({ updates: store.getState().updates + 1 });
    });

    return () => {
      channel.unbind("update");
    };
  }, [props.pusherKey, props.pusherCluster]);

  return <context.Provider value={store}>{props.children}</context.Provider>;
};

export const useUpdates = () => {
  const state = useContext(context);

  if (state === null) {
    throw new Error("useUpdates must be used within a UpdatesProvider");
  }

  return useStore(state, (store) => store.updates);
};

export const useReset = () => {
  const state = useContext(context);

  if (state === null) {
    throw new Error("useReset must be used within a UpdatesProvider");
  }

  return useStore(state, (store) => store.reset);
};
