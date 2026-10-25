import { defineAsyncComponent, type AsyncComponentLoader, type Component } from "vue";
import PanelLoading from "./PanelLoading.vue";
import PanelLoadError from "./PanelLoadError.vue";

export function lazyPanel<T extends Component>(loader: AsyncComponentLoader<T>) {
  return defineAsyncComponent({
    loader,
    loadingComponent: PanelLoading,
    errorComponent: PanelLoadError,
    delay: 200,
    timeout: 20000,
  });
}
