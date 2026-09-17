#include "LifeHud.h"
#include "Engine/Canvas.h"
#include "Engine/Engine.h"

void AShenchengjiLifeHud::DrawHUD()
{
	Super::DrawHUD();
	if (!Canvas)
	{
		return;
	}

	auto Line = [&](const FString& Text, float X, float Y, const FLinearColor& Color, float Scale = 1.2f)
	{
		if (Text.IsEmpty())
		{
			return;
		}
		FCanvasTextItem Item(FVector2D(X, Y), FText::FromString(Text), GEngine->GetSmallFont(), Color);
		Item.Scale = FVector2D(Scale, Scale);
		Item.EnableShadow(FLinearColor::Black);
		Canvas->DrawItem(Item);
	};

	Line(FString::Printf(TEXT("深城纪  ¥ %d  %s"), Cash, bWalking ? TEXT("步行") : TEXT("驾车")), 36.f, 28.f, FLinearColor(1.f, 0.86f, 0.4f), 1.35f);
	Line(Objective, 36.f, 64.f, FLinearColor::White, 1.25f);
	Line(Prompt, 36.f, 96.f, FLinearColor(0.75f, 0.9f, 1.f));
	if (!Dialogue.IsEmpty())
	{
		Line(Dialogue, 36.f, Canvas->ClipY - 180.f, FLinearColor(1.f, 0.96f, 0.86f), 1.3f);
	}
	if (!ChoiceA.IsEmpty())
	{
		Line(TEXT("1  ") + ChoiceA, 36.f, Canvas->ClipY - 130.f, FLinearColor(0.7f, 1.f, 0.75f));
	}
	if (!ChoiceB.IsEmpty())
	{
		Line(TEXT("2  ") + ChoiceB, 36.f, Canvas->ClipY - 104.f, FLinearColor(0.7f, 1.f, 0.75f));
	}
	Line(TEXT("J 最后一单   E 交互   F 上下车   数字键接职业单"), 36.f, Canvas->ClipY - 48.f, FLinearColor(0.65f, 0.65f, 0.65f), 1.05f);
}
