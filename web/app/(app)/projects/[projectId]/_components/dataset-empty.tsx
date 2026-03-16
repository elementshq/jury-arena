import { Cloud, Sparkles, Upload } from "lucide-react";
import { DemoDisabled } from "@/components/demo-disabled";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

interface DatasetEmptyProps {
  onUpload: () => void;
}

export function DatasetEmpty({ onUpload }: DatasetEmptyProps) {
  return (
    <Card className="p-12">
      <div className="flex flex-col items-center text-center max-w-md mx-auto">
        <div className="h-16 w-16 rounded-full bg-slate-100 flex items-center justify-center mb-4">
          <Cloud className="h-8 w-8 text-slate-400" />
        </div>

        <h2 className="text-slate-900 mb-2">Add data for evaluation</h2>
        <p className="text-slate-600 mb-8">
          Upload real-world logs to visualize the true performance of your
          models.
        </p>

        <div className="flex gap-3">
          <DemoDisabled>
            <Button onClick={onUpload} size="lg" className="w-[200px]">
              <Upload className="mr-2 h-4 w-4" />
              Upload
            </Button>
          </DemoDisabled>
          <DemoDisabled>
            <Button
              onClick={onUpload}
              variant="outline"
              size="lg"
              className="w-[200px]"
            >
              <Sparkles className="mr-2 h-4 w-4" />
              Use template
            </Button>
          </DemoDisabled>
        </div>
      </div>
    </Card>
  );
}
