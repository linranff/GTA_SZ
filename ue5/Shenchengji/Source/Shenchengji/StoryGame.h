#pragma once

#include "CoreMinimal.h"
#include "CityTypes.h"

struct FShenchengjiStoryLine
{
	FString Speaker;
	FString Text;
};

struct FShenchengjiStoryChoice
{
	FString Id;
	FString Label;
	FString Next;
	FString Consequence;
};

struct FShenchengjiStoryStep
{
	FString Id;
	FString Place;
	FString Title;
	FString Objective;
	FString Action;
	TArray<FShenchengjiStoryLine> Lines;
	FString Next;
	TArray<FShenchengjiStoryChoice> Choices;
	bool bTerminal = false;
};

struct FShenchengjiStoryContent
{
	int32 SchemaVersion = 1;
	FString Id;
	FString Title;
	FString Synopsis;
	FString FirstStep;
	int32 Reward = 180;
	TArray<FShenchengjiStoryStep> Steps;
};

struct FShenchengjiStoryFrame
{
	double X = 0;
	double Z = 0;
	double Speed = 0;
	bool bInVehicle = true;
	bool bPaused = false;
	int32 DebugEpoch = 0;
};

enum class EShenchengjiStoryPhase : uint8
{
	Idle,
	Travel,
	Dialogue,
	Choice,
	Payout,
	Done
};

class SHENCHENGJI_API FShenchengjiStoryGame
{
public:
	static constexpr double ArriveRadius = 28.0;
	static constexpr double StopSpeed = 1.0;

	bool LoadFromDisk(FString& OutError);
	bool Start(FString& OutMessage);
	bool Arrive(FString& OutMessage);
	bool Interact(const FShenchengjiStoryFrame& Frame, FString& OutMessage);
	bool Choose(const FString& ChoiceId, FString& OutMessage);
	bool TryPayout(TFunctionRef<bool(const FString&, int32)> Credit, FString& OutMessage);

	EShenchengjiStoryPhase GetPhase() const { return Phase; }
	FString CurrentLine() const;
	const FShenchengjiStoryStep* GetStep() const;
	const FShenchengjiGamePoint* GetDestination(const FShenchengjiCitySkeleton& Skeleton) const;
	int32 GetReward() const { return Content.Reward; }
	const FShenchengjiStoryContent& GetContent() const { return Content; }

private:
	const FShenchengjiStoryStep* FindStep(const FString& Id) const;
	void Enter(const FString& StepId);

	FShenchengjiStoryContent Content;
	EShenchengjiStoryPhase Phase = EShenchengjiStoryPhase::Idle;
	FString StepId;
	int32 LineIndex = 0;
	TSet<FString> PaidOnce;
};
