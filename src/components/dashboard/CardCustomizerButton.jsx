import { useState } from "react";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Settings, GripVertical, Eye, EyeOff, RotateCcw } from "lucide-react";

export default function CardCustomizerButton({ cards, setCards, defaultCards }) {
  const [open, setOpen] = useState(false);

  const onDragEnd = (result) => {
    if (!result.destination) return;
    const reordered = [...cards];
    const [moved] = reordered.splice(result.source.index, 1);
    reordered.splice(result.destination.index, 0, moved);
    setCards(reordered);
  };

  const toggleVisible = (id) => {
    setCards(cards.map(c => c.id === id ? { ...c, visible: c.visible === false ? true : false } : c));
  };

  const reset = () => setCards(defaultCards);

  return (
    <>
      <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setOpen(true)}>
        <Settings className="w-3.5 h-3.5" /> Customize
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings className="w-4 h-4" /> Customize Dashboard Cards
            </DialogTitle>
          </DialogHeader>
          <p className="text-xs text-gray-500 -mt-1">Drag to reorder. Toggle eye to show/hide.</p>

          <DragDropContext onDragEnd={onDragEnd}>
            <Droppable droppableId="cards">
              {(provided) => (
                <div ref={provided.innerRef} {...provided.droppableProps} className="space-y-2 py-1">
                  {cards.map((card, index) => (
                    <Draggable key={card.id} draggableId={card.id} index={index}>
                      {(provided, snapshot) => (
                        <div
                          ref={provided.innerRef}
                          {...provided.draggableProps}
                          className={`flex items-center gap-3 p-3 rounded-lg border bg-white select-none ${snapshot.isDragging ? "shadow-lg border-blue-300" : "border-gray-200"}`}
                        >
                          <div {...provided.dragHandleProps} className="text-gray-300 hover:text-gray-500 cursor-grab">
                            <GripVertical className="w-4 h-4" />
                          </div>
                          <span className="flex-1 text-sm font-medium text-gray-800">{card.label}</span>
                          <button
                            onClick={() => toggleVisible(card.id)}
                            className={`p-1 rounded transition-colors ${card.visible === false ? "text-gray-300 hover:text-gray-500" : "text-blue-500 hover:text-blue-700"}`}
                          >
                            {card.visible === false ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </button>
                        </div>
                      )}
                    </Draggable>
                  ))}
                  {provided.placeholder}
                </div>
              )}
            </Droppable>
          </DragDropContext>

          <div className="flex justify-between pt-1">
            <Button variant="ghost" size="sm" className="gap-1.5 text-gray-500" onClick={reset}>
              <RotateCcw className="w-3.5 h-3.5" /> Reset to Default
            </Button>
            <Button size="sm" onClick={() => setOpen(false)}>Done</Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}