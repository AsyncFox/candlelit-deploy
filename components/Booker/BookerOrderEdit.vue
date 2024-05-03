<template>
  <UseTemplate>
    <form class="space-y-4" @submit="onSubmit">
      <FormField name="startTime">
        <FormItem>
          <FormLabel>开始时间</FormLabel>
          <FormControl>
            <BookerDateTimePicker v-model:time="startTime" @update:time="(val) => setValues({ startTime: val })" />
          </FormControl>
          <FormMessage />
        </FormItem>
      </FormField>
      <FormField name="endTime">
        <FormItem>
          <FormLabel>结束时间</FormLabel>
          <FormControl>
            <BookerDateTimePicker v-model:time="endTime" @update:time="(val) => setValues({ endTime: val })" />
          </FormControl>
          <FormMessage />
        </FormItem>
      </FormField>
      <FormField v-slot="{ componentField }" name="capacity">
        <FormItem>
          <FormLabel>使用人数</FormLabel>
          <FormControl>
            <Input id="capacity" type="number" v-bind="componentField" />
          </FormControl>
          <FormMessage />
        </FormItem>
      </FormField>
      <FormField v-slot="{ componentField }" name="description">
        <FormItem>
          <FormLabel>场地用途</FormLabel>
          <FormControl>
            <Textarea id="description" v-bind="componentField" />
          </FormControl>
          <FormMessage />
        </FormItem>
      </FormField>
      <div class="flex gap-x-2 mt-4">
        <Button type="submit" class="font-bold text-base w-full" :disabled="isLoading">
          <Icon v-if="isLoading" icon="ph:spinner" class="w-5 h-5 animate-spin" />
          保存
        </Button>
        <Button
          v-if="!isAddingNewOrder"
          variant="destructive"
          type="button"
          class="font-bold text-base w-full"
          @click.prevent="() => removeOrder()"
        >
          删除
        </Button>
      </div>
    </form>
  </UseTemplate>

  <Dialog v-model:open="isOrderEditDialogOpen">
    <DialogContent class="max-w-[90vw] rounded-lg">
      <DialogHeader>
        <DialogTitle>
          {{ isAddingNewOrder ? '添加新的预约' : '编辑预约' }}
        </DialogTitle>
      </DialogHeader>
      <NewOrderInput />
    </DialogContent>
  </Dialog>

  <!-- <Drawer v-else v-model:open="isOrderEditDialogOpen">
    <DrawerContent>
      <DrawerHeader class="text-left">
        <DrawerTitle>添加新的预约</DrawerTitle>
      </DrawerHeader>
      <NewOrderInput />
    </DrawerContent>
  </Drawer> -->
</template>

<script lang="ts" setup>
import { createReusableTemplate, useMediaQuery } from '@vueuse/core';
import { z } from 'zod';
import { useForm } from 'vee-validate';
import { toTypedSchema } from '@vee-validate/zod';
import { toast } from 'vue-sonner';
import { editingOrderIndexer, isOrderEditDialogOpen } from '@/composables/dialog';
import { Button } from '@/components/ui/button';
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';
import { formatTimeString } from '~/utils/shared';

const schema = toTypedSchema(z.object({
  startTime: z.date(),
  endTime: z.date(),
  capacity: z.number(),
  description: z.string(),
}));

const bookerStore = useBookerStore();

const startTime = ref<Date>(new Date());
const endTime = ref<Date>(new Date());
const isLoading = ref(false);

const { handleSubmit, setValues } = useForm({
  validationSchema: schema,
  initialValues: {
    startTime: new Date(),
    endTime: new Date(),
    capacity: 10,
    description: '',
  },
});

const isAddingNewOrder = computed(() => editingOrderIndexer.value === undefined);

watch(editingOrderIndexer, async (newVal) => {
  if (newVal === undefined) {
    setValues({
      startTime: new Date(),
      endTime: new Date(),
      capacity: 10,
      description: '',
    });
  } else {
    const order = bookerStore.getOrder(newVal);
    if (order) {
      setValues({
        capacity: order.capacity,
        description: order.description,
      });
      startTime.value = new Date(order.startTime);
      endTime.value = new Date(order.endTime);
    }
  }
});

const onSubmit = handleSubmit(async (values) => {
  isLoading.value = true;
  const orderInput = {
    capacity: values.capacity,
    description: values.description,
    startTime: formatTimeString(values.startTime),
    endTime: formatTimeString(values.endTime),
  };
  try {
    if (editingOrderIndexer.value)
      await bookerStore.updateOrder(editingOrderIndexer.value, orderInput);
    else
      await bookerStore.addOrder(orderInput);
    isLoading.value = false;
    isOrderEditDialogOpen.value = false;
  } catch (error) {
    isLoading.value = false;
    if (error instanceof Error)
      toast.error(error.message);
  }
});

function removeOrder() {
  if (editingOrderIndexer.value !== undefined)
    bookerStore.removeOrder(editingOrderIndexer.value);
  isOrderEditDialogOpen.value = false;
}

const [UseTemplate, NewOrderInput] = createReusableTemplate();
// const isDesktop = useMediaQuery('(min-width: 768px)');
</script>