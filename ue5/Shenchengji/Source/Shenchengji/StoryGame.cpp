#include "StoryGame.h"
#include "CityLoader.h"

const FShenchengjiStoryStep* FShenchengjiStoryGame::FindStep(const FString& Id) const
{
	return Content.Steps.FindByPredicate([&](const FShenchengjiStoryStep& Step) { return Step.Id == Id; });
}

const FShenchengjiStoryStep* FShenchengjiStoryGame::GetStep() const
{
	return FindStep(StepId);
}

FString FShenchengjiStoryGame::CurrentLine() const
{
	const FShenchengjiStoryStep* Step = GetStep();
	if (!Step || !Step->Lines.IsValidIndex(LineIndex) || Phase == EShenchengjiStoryPhase::Travel)
	{
		return FString();
	}
	return Step->Lines[LineIndex].Text;
}

const FShenchengjiGamePoint* FShenchengjiStoryGame::GetDestination(const FShenchengjiCitySkeleton& Skeleton) const
{
	const FShenchengjiStoryStep* Step = GetStep();
	if (!Step)
	{
		return nullptr;
	}
	return Skeleton.Places.Find(Step->Place);
}

void FShenchengjiStoryGame::Enter(const FString& NextId)
{
	StepId = NextId;
	LineIndex = 0;
	const FShenchengjiStoryStep* Step = FindStep(StepId);
	Phase = Step && Step->Lines.Num() > 0 ? EShenchengjiStoryPhase::Dialogue : EShenchengjiStoryPhase::Travel;
}

bool FShenchengjiStoryGame::LoadFromDisk(FString& OutError)
{
	const TSharedPtr<FJsonObject> Root = FShenchengjiCityLoader::ReadJsonFile(FShenchengjiCityLoader::StoryPath(), OutError);
	if (!Root.IsValid())
	{
		return false;
	}

	Content = FShenchengjiStoryContent();
	Content.SchemaVersion = static_cast<int32>(Root->GetNumberField(TEXT("schemaVersion")));
	Content.Id = Root->GetStringField(TEXT("id"));
	Content.Title = Root->GetStringField(TEXT("title"));
	Content.Synopsis = Root->GetStringField(TEXT("synopsis"));
	Content.FirstStep = Root->GetStringField(TEXT("firstStep"));
	Content.Reward = static_cast<int32>(Root->GetNumberField(TEXT("reward")));

	const TArray<TSharedPtr<FJsonValue>>* Steps = nullptr;
	if (!Root->TryGetArrayField(TEXT("steps"), Steps) || !Steps)
	{
		OutError = TEXT("故事缺少 steps");
		return false;
	}

	for (const TSharedPtr<FJsonValue>& Value : *Steps)
	{
		const TSharedPtr<FJsonObject> Object = Value.IsValid() ? Value->AsObject() : nullptr;
		if (!Object.IsValid())
		{
			continue;
		}
		FShenchengjiStoryStep Step;
		Step.Id = Object->GetStringField(TEXT("id"));
		Step.Place = Object->GetStringField(TEXT("place"));
		Step.Title = Object->GetStringField(TEXT("title"));
		Step.Objective = Object->GetStringField(TEXT("objective"));
		Step.Action = Object->GetStringField(TEXT("action"));
		Step.Next = Object->HasField(TEXT("next")) ? Object->GetStringField(TEXT("next")) : FString();
		Step.bTerminal = Object->HasField(TEXT("terminal")) && Object->GetBoolField(TEXT("terminal"));
		const TArray<TSharedPtr<FJsonValue>>* Lines = nullptr;
		if (Object->TryGetArrayField(TEXT("lines"), Lines) && Lines)
		{
			for (const TSharedPtr<FJsonValue>& LineValue : *Lines)
			{
				const TSharedPtr<FJsonObject> LineObject = LineValue.IsValid() ? LineValue->AsObject() : nullptr;
				if (LineObject.IsValid())
				{
					FShenchengjiStoryLine Line;
					Line.Speaker = LineObject->GetStringField(TEXT("speaker"));
					Line.Text = LineObject->GetStringField(TEXT("text"));
					Step.Lines.Add(Line);
				}
			}
		}
		const TArray<TSharedPtr<FJsonValue>>* Choices = nullptr;
		if (Object->TryGetArrayField(TEXT("choices"), Choices) && Choices)
		{
			for (const TSharedPtr<FJsonValue>& ChoiceValue : *Choices)
			{
				const TSharedPtr<FJsonObject> ChoiceObject = ChoiceValue.IsValid() ? ChoiceValue->AsObject() : nullptr;
				if (ChoiceObject.IsValid())
				{
					FShenchengjiStoryChoice Choice;
					Choice.Id = ChoiceObject->GetStringField(TEXT("id"));
					Choice.Label = ChoiceObject->GetStringField(TEXT("label"));
					Choice.Next = ChoiceObject->GetStringField(TEXT("next"));
					Choice.Consequence = ChoiceObject->GetStringField(TEXT("consequence"));
					Step.Choices.Add(Choice);
				}
			}
		}
		Content.Steps.Add(MoveTemp(Step));
	}

	if (Content.Id != TEXT("bay-last-delivery") || Content.Reward != 180 || !FindStep(Content.FirstStep))
	{
		OutError = TEXT("故事契约不符：需要 bay-last-delivery / reward 180 / 可达 firstStep");
		return false;
	}

	Phase = EShenchengjiStoryPhase::Idle;
	StepId.Reset();
	return true;
}

bool FShenchengjiStoryGame::Start(FString& OutMessage)
{
	if (Content.Steps.Num() == 0)
	{
		OutMessage = TEXT("故事尚未载入");
		return false;
	}
	Enter(Content.FirstStep);
	Phase = EShenchengjiStoryPhase::Travel;
	OutMessage = TEXT("已接下 · 最后一单");
	return true;
}

bool FShenchengjiStoryGame::Arrive(FString& OutMessage)
{
	const FShenchengjiStoryStep* Step = GetStep();
	if (!Step || Phase != EShenchengjiStoryPhase::Travel)
	{
		OutMessage = TEXT("当前不在赶路");
		return false;
	}
	LineIndex = 0;
	if (Step->Lines.Num() > 0)
	{
		Phase = EShenchengjiStoryPhase::Dialogue;
		OutMessage = Step->Lines[0].Text;
		return true;
	}
	if (Step->Choices.Num() > 0)
	{
		Phase = EShenchengjiStoryPhase::Choice;
		OutMessage = Step->Choices[0].Label;
		return true;
	}
	OutMessage = Step->Objective;
	return true;
}

bool FShenchengjiStoryGame::Interact(const FShenchengjiStoryFrame& Frame, FString& OutMessage)
{
	const FShenchengjiStoryStep* Step = GetStep();
	if (!Step)
	{
		OutMessage = TEXT("先开始最后一单");
		return false;
	}
	if (Frame.bPaused)
	{
		OutMessage = TEXT("返回城市后再交接");
		return false;
	}

	if (Phase == EShenchengjiStoryPhase::Travel)
	{
		OutMessage = Step->Objective;
		return false;
	}

	if (Phase == EShenchengjiStoryPhase::Dialogue)
	{
		LineIndex++;
		if (LineIndex >= Step->Lines.Num())
		{
			if (Step->Choices.Num() > 0)
			{
				Phase = EShenchengjiStoryPhase::Choice;
				OutMessage = Step->Choices[0].Label;
				return true;
			}
			if (Step->bTerminal)
			{
				Phase = EShenchengjiStoryPhase::Payout;
				OutMessage = TEXT("回驿站结算");
				return true;
			}
			Enter(Step->Next);
			Phase = EShenchengjiStoryPhase::Travel;
			OutMessage = TEXT("继续下一站");
			return true;
		}
		OutMessage = Step->Lines[LineIndex].Text;
		return true;
	}

	OutMessage = TEXT("先做选择");
	return false;
}

bool FShenchengjiStoryGame::Choose(const FString& ChoiceId, FString& OutMessage)
{
	const FShenchengjiStoryStep* Step = GetStep();
	if (!Step || Phase != EShenchengjiStoryPhase::Choice)
	{
		OutMessage = TEXT("当前没有选项");
		return false;
	}
	const FShenchengjiStoryChoice* Choice = Step->Choices.FindByPredicate([&](const FShenchengjiStoryChoice& Item) { return Item.Id == ChoiceId; });
	if (!Choice)
	{
		OutMessage = TEXT("选项不存在");
		return false;
	}
	OutMessage = Choice->Consequence;
	Enter(Choice->Next);
	Phase = EShenchengjiStoryPhase::Travel;
	return true;
}

bool FShenchengjiStoryGame::TryPayout(TFunctionRef<bool(const FString&, int32)> Credit, FString& OutMessage)
{
	if (Phase != EShenchengjiStoryPhase::Payout && Phase != EShenchengjiStoryPhase::Done)
	{
		OutMessage = TEXT("这一单还没结束");
		return false;
	}
	if (!Credit(TEXT("bay-last-delivery"), Content.Reward))
	{
		OutMessage = TEXT("钱包不可用，未重复发放");
		return false;
	}
	Phase = EShenchengjiStoryPhase::Done;
	OutMessage = FString::Printf(TEXT("工钱 +¥ %d"), Content.Reward);
	return true;
}
