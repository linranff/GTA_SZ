#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Character.h"
#include "WalkerPawn.generated.h"

UCLASS()
class SHENCHENGJI_API AShenchengjiWalker : public ACharacter
{
	GENERATED_BODY()

public:
	AShenchengjiWalker();
	virtual void SetupPlayerInputComponent(UInputComponent* PlayerInputComponent) override;
	virtual void Tick(float DeltaSeconds) override;

	static constexpr float WalkSpeed = 160.f;
	static constexpr float RunSpeed = 420.f;

private:
	void MoveForward(float Value);
	void MoveRight(float Value);
	void Turn(float Value);
	void LookUp(float Value);
	void StartRun();
	void StopRun();
};
